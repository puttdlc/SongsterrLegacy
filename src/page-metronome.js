/*
 * Classic Skin: metronome with the original recording (runs in the page's MAIN world)
 * ===========================================================================
 * Songsterr's metronome is part of its Synth audio engine. When the original
 * recording (the synced YouTube video) plays, that engine is idle and the
 * video player's setMetronome() is empty, so Songsterr greys the button out
 * ("Metronome is not supported with original audio"), ignores N, and doesn't
 * render its Metronome window.
 *
 * This script fills that gap while html has .sc-orig-metronome (content.js:
 * Reskin on and "Orig. metronome: On"):
 *   - It finds Songsterr's own store (the object its Preact app at #root is rendered
 *     with) and listens to the same "controls/metronome" action the button
 *     and N send. With the video open it flips the same isMetronome setting
 *     Songsterr keeps for Synth, so one switch covers both sources.
 *   - It makes the button clickable and shows it pressed, and adds a "..."
 *     tab that opens a small Metronome window with the volume slider. The
 *     slider writes Songsterr's own metronome volume.
 *   - It plays the clicks itself with Web Audio. The beats come from the
 *     video player's own metronome timeline (the beat list Synth's metronome
 *     uses, repeats included), mapped onto the video with the player's own
 *     bar-to-video sync points. The video's position, speed and state are
 *     read from its YouTube player, so seeking, loops and slow-down follow.
 *
 * Guarantees:
 *   - Makes no requests. Only acts while the video is the audio source.
 *   - Dispatches only plain setters (no suspend/resume), so toggling or
 *     changing the volume never pauses or restarts the video.
 *   - Any error stops our clicks and leaves Songsterr as it was.
 */
(() => {
  'use strict';

  if (window.__scOrigMetronome) return;
  window.__scOrigMetronome = true;

  const root = document.documentElement;
  const ON_CLASS = 'sc-orig-metronome';
  const TITLE = 'Metronome ((N))';
  const FAST_MS = 25;          // scheduler tick while clicks may be due
  const SLOW_MS = 250;         // upkeep otherwise
  const LOOKAHEAD = 0.12;      // seconds of clicks scheduled ahead
  const LOOKAHEAD_HIDDEN = 1.2; // background tabs run timers about once a second
  const POPUP_MARGIN = 8;

  let store = null;
  let storeTries = 0;

  const enabled = () => root.classList.contains(ON_CLASS);

  // ---------------------------------------------------------------------------
  // Songsterr's store: rendered into #root as <... context={store}><... store={store}>.
  // ---------------------------------------------------------------------------
  function isStore(value) {
    try {
      return !!value && typeof value.get === 'function' && typeof value.dispatch === 'function' &&
        typeof value.on === 'function' && !!value.get().player;
    } catch (_) {
      return false;
    }
  }

  function storeIn(props) {
    if (!props || typeof props !== 'object') return null;
    if (isStore(props.store)) return props.store;
    if (isStore(props.context)) return props.context;
    return null;
  }

  // Songsterr renders with Preact: #root.__k is the root vnode, each vnode
  // keeps its children in __k and its props in props. (React's fibre tree,
  // __reactContainer$*, is checked too in case that ever changes.)
  function findStore() {
    const el = document.getElementById('root');
    if (!el) return null;
    const queue = [];
    if (el.__k) queue.push({ node: el.__k, preact: true });
    const key = Object.keys(el).find((k) => k.startsWith('__reactContainer$'));
    let fiber = key ? el[key] : null;
    if (fiber && fiber.stateNode && fiber.stateNode.current) fiber = fiber.stateNode.current;
    if (fiber) queue.push({ node: fiber, preact: false });
    for (let seen = 0; queue.length && seen < 300; seen++) {
      const { node, preact } = queue.shift();
      const found = storeIn(preact ? node.props : node.memoizedProps);
      if (found) return found;
      if (preact) {
        if (Array.isArray(node.__k)) {
          for (const child of node.__k) if (child && typeof child === 'object') queue.push({ node: child, preact });
        }
      } else {
        if (node.child) queue.push({ node: node.child, preact });
        if (node.sibling) queue.push({ node: node.sibling, preact });
      }
    }
    return null;
  }

  // The video is the audio source on a tab page (not a diff, not an audio file).
  function origActive(s) {
    const p = s && s.player;
    return !!p && p.videoOpened && !p.userAudioSelected && !p.separatedAudioSelected &&
      !!(s.video && s.video.current) && !!s.routeContent && s.routeContent.page === 'tab';
  }

  function attach(found) {
    store = found;
    // Same action as the button's click and the N key. Songsterr's handler
    // returns early while the video is open; this one only acts then.
    store.on('controls/metronome', (s) => {
      if (!enabled() || !origActive(s)) return;
      if (s.route && s.route.isPanel) return;
      if (!s.meta || s.meta.isFailed || !s.meta.allowedByLicense || (s.parts && s.parts.isFailed)) return;
      store.dispatch('player/toggleMetronome');
      const value = store.get().player.isMetronome;
      try {
        (store.dispatchThunk || store.dispatch)('preferences/sync', { key: 'isMetronome', value });
      } catch (_) { /* not saved; still toggled for this page */ }
      sync();
    });
    if (typeof store.subscribeWithSelector === 'function') {
      store.subscribeWithSelector((s) => {
        const p = s.player || {};
        return `${origActive(s)}|${p.isMetronome}|${p.metronomeVolume}|${p.metronomeType}`;
      }, () => sync());
    }
  }

  // ---------------------------------------------------------------------------
  // The button: clickable and shown pressed while the video plays.
  // Songsterr only rewrites these attributes when its own props change (they
  // don't while the video stays open), so they are set once per change and
  // checked again on every pass.
  // ---------------------------------------------------------------------------
  const MARK = 'data-sc-orig';   // on the button while we have changed it
  const DISABLED_TITLE = 'Metronome is not supported with original audio';

  function metronomeButton() {
    return document.querySelector('#c-metronome > button[id^="control-"]');
  }

  // Songsterr's button classes: "<hash>_button", plus "<hash>_chosen" when
  // pressed or "<hash>_disabledFeaturesBtn" when disabled.
  function classFor(className, state) {
    const m = /(\S+?)_(?:disabledFeaturesBtn|chosen|button)\b/.exec(className);
    if (!m) return null;
    const extra = { pressed: 'chosen', off: '', disabled: 'disabledFeaturesBtn' }[state];
    return extra ? `${m[1]}_button ${m[1]}_${extra}` : `${m[1]}_button`;
  }

  function syncButton(active, pressed) {
    const btn = metronomeButton();
    if (!btn) return;
    if (active) {
      if (!btn.hasAttribute(MARK)) btn.setAttribute(MARK, '');
      if (btn.disabled) btn.disabled = false;
      const p = String(pressed);
      if (btn.getAttribute('aria-pressed') !== p) btn.setAttribute('aria-pressed', p);
      const cls = classFor(btn.className, pressed ? 'pressed' : 'off');
      if (cls && btn.className !== cls) btn.className = cls;
      if (btn.title !== TITLE) btn.title = TITLE;
    } else if (btn.hasAttribute(MARK)) {
      btn.removeAttribute(MARK);
      // Back to Synth: Songsterr rewrites the attributes itself. Feature
      // switched off with the video still open: back to Songsterr's
      // disabled button.
      const s = store && store.get();
      if (s && origActive(s)) {
        btn.disabled = true;
        btn.setAttribute('aria-pressed', 'false');
        const cls = classFor(btn.className, 'disabled');
        if (cls) btn.className = cls;
        btn.title = DISABLED_TITLE;
      }
    }
  }

  // Preact re-renders the button (disabled again) after the store changes,
  // so changes inside the metronome slot are answered straight away.
  let observed = null;
  let syncQueued = false;
  const observer = new MutationObserver(() => {
    if (syncQueued) return;
    syncQueued = true;
    queueMicrotask(() => {
      syncQueued = false;
      try { sync(); } catch (_) { /* next pass retries */ }
    });
  });

  function watchSlot() {
    const host = document.getElementById('c-metronome');
    if (host === observed) return;
    observer.disconnect();
    observed = host;
    if (host) {
      observer.observe(host, {
        attributes: true,
        attributeFilter: ['disabled', 'class', 'aria-pressed', 'title'],
        childList: true,
        subtree: true
      });
    }
  }

  // ---------------------------------------------------------------------------
  // "..." tab and Metronome window (Songsterr renders neither with the video).
  // ---------------------------------------------------------------------------
  const SVG_NS = 'http://www.w3.org/2000/svg';
  let tab = null;
  let popup = null;
  let slider = null;
  let valueOut = null;
  let note = null;
  let popupOpen = false;

  function svg(viewBox, width, height, build) {
    const el = document.createElementNS(SVG_NS, 'svg');
    el.setAttribute('viewBox', viewBox);
    el.setAttribute('width', width);
    el.setAttribute('height', height);
    el.setAttribute('aria-hidden', 'true');
    build(el);
    return el;
  }

  function shape(parent, tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    parent.appendChild(el);
  }

  function buildTab() {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'sc-metronome-settings';
    b.title = 'Metronome settings';
    b.setAttribute('aria-haspopup', 'dialog');
    b.appendChild(svg('0 0 13 3', '13', '3', (el) => {
      for (const cx of [1.5, 6.5, 11.5]) shape(el, 'circle', { cx, cy: '1.5', r: '1.5' });
    }));
    b.addEventListener('click', (event) => {
      event.stopPropagation();
      setPopup(!popupOpen);
    });
    return b;
  }

  function buildPopup() {
    const el = document.createElement('div');
    el.id = 'sc-metronome-popup';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Metronome');

    const head = document.createElement('div');
    head.className = 'sc-mp-head';
    const title = document.createElement('span');
    title.textContent = 'Metronome';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'sc-mp-close';
    close.title = 'Close';
    close.setAttribute('aria-label', 'Close');
    close.appendChild(svg('0 0 10 10', '10', '10', (s) => {
      shape(s, 'path', { d: 'M1 1l8 8M9 1l-8 8', stroke: 'currentColor', 'stroke-width': '1.6', fill: 'none' });
    }));
    close.addEventListener('click', () => setPopup(false));
    head.append(title, close);

    const row = document.createElement('label');
    row.className = 'sc-mp-row';
    row.appendChild(svg('0 0 16 16', '16', '16', (s) => {
      shape(s, 'path', { d: 'M2 6h3l4-3v10l-4-3H2z', fill: 'currentColor' });
      shape(s, 'path', { d: 'M11 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6 6 0 0 1 0 9', stroke: 'currentColor', 'stroke-width': '1.3', fill: 'none' });
    }));
    slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.step = '1';
    slider.setAttribute('aria-label', 'Metronome volume');
    slider.addEventListener('input', () => setVolume(Number(slider.value)));
    valueOut = document.createElement('output');
    row.append(slider, valueOut);

    note = document.createElement('p');
    note.className = 'sc-mp-note';
    note.textContent = 'One Two counts as Tick Tock with the original recording.';

    el.append(head, row, note);
    // Keys used by the slider stay with it (Songsterr has its own hotkeys).
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        setPopup(false);
        if (tab) tab.focus();
      }
      event.stopPropagation();
    });
    return el;
  }

  function setVolume(volume) {
    if (!store) return;
    valueOut.value = String(volume);
    // The plain setter: the :init variant pauses and restarts the player.
    store.dispatch('player/changeMetronomeVolume', volume);
    applyGain(volume);
  }

  function setPopup(open) {
    popupOpen = open;
    if (open) {
      if (!popup) popup = buildPopup();
      if (!popup.isConnected) document.body.appendChild(popup);
      fillPopup();
      placePopup();
      slider.focus({ preventScroll: true });
    } else if (popup && popup.isConnected) {
      popup.remove();
    }
    if (tab) tab.setAttribute('aria-expanded', String(open));
  }

  function fillPopup() {
    const p = store.get().player;
    const volume = typeof p.metronomeVolume === 'number' ? p.metronomeVolume : 50;
    if (Number(slider.value) !== volume) slider.value = String(volume);
    valueOut.value = String(volume);
    note.hidden = p.metronomeType !== 'voice';
  }

  function px(styles, name) {
    return parseFloat(styles.getPropertyValue(name)) || 0;
  }

  // Classic and Fusion: centred over the button, above its "..." tab.
  // Legacy: beside the column, level with the button. Kept clear of the
  // Classic menu bar and player bar (--sc-top-inset, --sc-bottom-inset).
  function placePopup() {
    const anchor = document.getElementById('c-metronome');
    if (!popup || !anchor) return;
    const styles = getComputedStyle(root);
    const b = anchor.getBoundingClientRect();
    const w = popup.offsetWidth;
    const h = popup.offsetHeight;
    const highest = px(styles, '--sc-top-inset') + POPUP_MARGIN;
    const lowest = window.innerHeight - px(styles, '--sc-bottom-inset') - POPUP_MARGIN - h;
    let left;
    let top;
    if (root.classList.contains('sc-layout-minimal')) {
      left = window.innerWidth - (px(styles, '--sc-rail-w') || b.width) - w;
      top = Math.min(b.top, lowest);
    } else {
      left = Math.min(b.left + b.width / 2 - w / 2, window.innerWidth - w - POPUP_MARGIN);
      top = b.top - 12 - h;
    }
    left = `${Math.round(Math.max(POPUP_MARGIN, left))}px`;
    top = `${Math.round(Math.max(highest, top))}px`;
    if (popup.style.left !== left) popup.style.left = left;
    if (popup.style.top !== top) popup.style.top = top;
  }

  document.addEventListener('pointerdown', (event) => {
    if (!popupOpen) return;
    const t = event.target;
    if (popup && popup.contains(t)) return;
    if (tab && tab.contains(t)) return;
    setPopup(false);
  }, true);
  window.addEventListener('resize', () => {
    if (popupOpen) placePopup();
  });

  function syncTab(active, pressed) {
    const host = document.getElementById('c-metronome');
    const show = active && !!host && (pressed || popupOpen) && !document.getElementById('metronome-settings');
    if (show) {
      if (!tab) tab = buildTab();
      if (tab.parentNode !== host) host.appendChild(tab);
    } else if (tab && tab.isConnected) {
      tab.remove();
    }
    if (!active && popupOpen) setPopup(false);
  }

  function sync() {
    const s = store && store.get();
    const active = !!s && enabled() && origActive(s);
    const pressed = active && !!s.player.isMetronome;
    syncButton(active, pressed);
    syncTab(active, pressed);
    if (popupOpen) fillPopup();
  }

  // ---------------------------------------------------------------------------
  // Clicks
  // ---------------------------------------------------------------------------
  let ctx = null;
  let gain = null;
  let clicks = null;   // [accented, plain] AudioBuffers
  const pending = new Set();
  const scheduled = new Set();   // beat indexes already scheduled since the last jump

  function audio() {
    if (!ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      ctx = new Ctx({ latencyHint: 'interactive' });
      gain = ctx.createGain();
      gain.connect(ctx.destination);
      clicks = [makeClick(1760), makeClick(1320)];
      applyGain(store.get().player.metronomeVolume);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  // A short, bright tick: a sine with a 1ms attack and a fast decay.
  function makeClick(freq) {
    const rate = ctx.sampleRate;
    const length = Math.round(rate * 0.05);
    const buffer = ctx.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const env = Math.min(1, t / 0.001) * Math.exp(-t * 90);
      data[i] = Math.sin(2 * Math.PI * freq * t) * env;
    }
    return buffer;
  }

  function applyGain(volume) {
    if (!gain) return;
    const v = Math.max(0, Math.min(100, typeof volume === 'number' ? volume : 50)) / 100;
    gain.gain.setTargetAtTime(v ** 1.5, ctx.currentTime, 0.01);
  }

  function play(accented, when) {
    const src = ctx.createBufferSource();
    src.buffer = clicks[accented ? 0 : 1];
    src.connect(gain);
    src.start(when);
    pending.add(src);
    src.onended = () => pending.delete(src);
  }

  function silence() {
    for (const src of pending) {
      try { src.stop(); } catch (_) { /* already ended */ }
    }
    pending.clear();
    scheduled.clear();
    clock.valid = false;
  }

  // Songsterr's own mapping between two point lists (tab time <-> video
  // time, in ms): piecewise linear, extended past both ends.
  function mapPoints(from, to, x) {
    const last = Math.min(from.length, to.length) - 1;
    if (last === 0 || from[last] < x) return x - from[last] + to[last];
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >>> 1;
      if (from[mid] <= x) lo = mid;
      else hi = mid;
    }
    const span = from[hi] - from[lo];
    return span ? to[lo] + (x - from[lo]) * (to[hi] - to[lo]) / span : to[lo] + (x - from[lo]);
  }

  let beatCache = { part: null, audioPoints: null, videoPoints: null, beats: null };

  // Every beat's tab time (ms), video time (s) and accent, for the current
  // part and sync points.
  function beatsFor(video) {
    const timeline = video.metronomeTimeline;
    const part = timeline && timeline.part;
    const audioPoints = video.getAudioPoints('tab');
    const videoPoints = video.getVideoPoints('tab');
    if (!part || !audioPoints || !audioPoints.length || !videoPoints || !videoPoints.length) return null;
    const c = beatCache;
    if (c.part === part && c.audioPoints === audioPoints && c.videoPoints === videoPoints) return c.beats;
    const spec = timeline.getMetronomeSpec();
    const n = spec.length;
    const beats = { tab: new Float64Array(n), at: new Float64Array(n), accent: new Uint8Array(n) };
    for (let i = 0; i < n; i++) {
      beats.tab[i] = spec[i].timestamp;
      beats.at[i] = mapPoints(audioPoints, videoPoints, spec[i].timestamp) / 1000;
      beats.accent[i] = spec[i].accented ? 1 : 0;
    }
    beatCache = { part, audioPoints, videoPoints, beats };
    scheduled.clear();
    return beats;
  }

  // The YouTube player reports its time in steps, so it is smoothed:
  // position = v0 + elapsed * rate, nudged towards each new reading and
  // restarted on a jump (seek, loop) or a speed change.
  const clock = { valid: false, v0: 0, t0: 0, rate: 1, raw: NaN };

  function videoTime(yt) {
    const now = performance.now();
    const raw = yt.getCurrentTime();
    const rate = yt.getPlaybackRate() || 1;
    let jumped = false;
    if (!clock.valid || rate !== clock.rate) {
      jumped = true;   // (re)started: the beat right at the start may be a tick old
      Object.assign(clock, { valid: true, v0: raw, t0: now, rate, raw });
    } else if (raw !== clock.raw) {
      const predicted = clock.v0 + (now - clock.t0) / 1000 * rate;
      const error = raw - predicted;
      if (Math.abs(error) > 0.25) {
        jumped = true;
        Object.assign(clock, { v0: raw, t0: now });
      } else {
        clock.v0 += error * 0.15;
      }
      clock.raw = raw;
    }
    if (jumped) {
      for (const src of pending) {
        try { src.stop(); } catch (_) { /* already ended */ }
      }
      pending.clear();
      scheduled.clear();
    }
    return { now: clock.v0 + (now - clock.t0) / 1000 * rate, rate, jumped };
  }

  function firstAtOrAfter(at, time) {
    let lo = 0;
    let hi = at.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (at[mid] < time) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  // The metronome is on with the video as the source: tick fast, even while
  // paused, so the first beat after play isn't missed.
  function armed(s) {
    return enabled() && origActive(s) && !!s.player.isMetronome;
  }

  // Returns true while the video plays and clicks are being scheduled.
  function schedule(s) {
    if (!armed(s)) return false;
    const video = s.services && s.services.video;
    const yt = video && video.player;
    if (!yt || typeof yt.getPlayerState !== 'function' || typeof yt.getCurrentTime !== 'function') return false;
    if (yt.getPlayerState() !== 1 || !video.isPlaying || video._isOnHold || (video.countIn && video.countIn.isPlaying)) return false;
    const beats = beatsFor(video);
    if (!beats || !beats.at.length) return false;

    const ac = audio();
    if (ac.state !== 'running') return false;
    const { now, rate, jumped } = videoTime(yt);
    const ahead = document.hidden ? LOOKAHEAD_HIDDEN : LOOKAHEAD;
    const late = jumped ? 0.05 : 0.02;
    const { loopStart = 0, loopEnd = 0 } = video.position || {};
    const looping = loopEnd > loopStart;
    const base = ac.currentTime;
    for (let i = firstAtOrAfter(beats.at, now - late); i < beats.at.length; i++) {
      const wait = (beats.at[i] - now) / rate;
      if (wait > ahead) break;
      if (scheduled.has(i)) continue;
      scheduled.add(i);
      // A loop jumps back at its end; the beat on the end is the next bar's.
      if (looping && beats.tab[i] >= loopEnd - 1) continue;
      play(beats.accent[i] === 1, base + Math.max(0, wait));
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------
  let wasRunning = false;

  function step() {
    if (!store) {
      // Look for the store a few times a second until the app has rendered.
      if (storeTries++ % 2 === 0) {
        const found = findStore();
        if (found) attach(found);
      }
      if (!store) return false;
    }
    const s = store.get();
    watchSlot();
    sync();
    if (popupOpen) placePopup();
    const running = schedule(s);
    if (!running && wasRunning) silence();
    wasRunning = running;
    return armed(s);
  }

  function loop() {
    let fast = false;
    try {
      fast = step();
    } catch (_) {
      try { silence(); } catch (__) { /* nothing playing */ }
      wasRunning = false;
    }
    setTimeout(loop, fast ? FAST_MS : SLOW_MS);
  }

  setTimeout(loop, SLOW_MS);
})();
