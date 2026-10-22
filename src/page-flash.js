/*
 * Classic Skin: note flash, experimental (runs in the page's MAIN world)
 * ======================================================================
 * While a tab plays (Synth or Orig.), each tab number lights up in the
 * accent colour when its beat is reached and fades back over the note's
 * length. On only while
 * <html> has sc-enabled and sc-note-flash (the popup's "Note flash").
 *
 * Reads, from Songsterr's store (found in its Preact tree, it isn't global):
 *   player.instance.getCursor()   song position in ms (the clock the synth
 *                                 and Songsterr's own fretboard follow; with
 *                                 Orig. it is the video time mapped through
 *                                 Songsterr's sync points)
 *   part.current.timestamps       one time (ms) per beat start, all voices
 *                                 merged, in play order (repeats unrolled)
 *   part.current.timeline         Map: timestamp -> that onset's layout, whose
 *                                 beats[] (every voice) carry voice, measure,
 *                                 startTick, durationInTicks, notes, layout
 *   multiPart.view.parts          in the multitrack view, every shown track
 *                                 (same shape as part.current, each with its
 *                                 own timestamps and layout); all flash
 * Fret numbers have no element of their own: each measure's are one merged
 * path (path[data-notes-measure = measure index + 1], other voices' in a
 * second one with "o" appended, in the line's own
 * coordinates, digits centred on beat.layout.absoluteX, strings 12px apart).
 * The flash is a copy of that path, clipped to the played notes and coloured
 * by base.css (notes.flash); Songsterr's elements are never changed.
 *
 * Guarantees:
 *   - Read-only towards Songsterr: no dispatch, no patched functions.
 *   - Any error or unexpected data shape turns the flash off for that track
 *     instead of throwing into the page.
 *   - Note lengths are scaled by how fast that clock really runs (measured,
 *     not the speed setting): a recording's tempo isn't the score's.
 *   - Off (or not playing): no per-frame work, only a 4Hz check of the play
 *     state.
 */
(() => {
  'use strict';

  const root = document.documentElement;
  const SVG = 'http://www.w3.org/2000/svg';
  const IDLE_MS = 250;

  let store = null;
  const cache = new WeakMap(); // part -> { ok, beats, timestamps, partId }
  const lastIndex = new Map(); // partId -> last flashed beat index
  let clock = null;        // { cursor, at, rate }: song ms per real ms, smoothed
  let rafId = 0;
  let idleId = 0;
  let clipSeq = 0;

  function enabled() {
    return root.classList.contains('sc-enabled') && root.classList.contains('sc-note-flash');
  }

  function storeIn(props) {
    if (!props) return null;
    for (const key of ['store', 'context', 'value']) {
      const s = props[key];
      if (s && typeof s.get === 'function' && typeof s.dispatch === 'function') return s;
    }
    return null;
  }

  function findStore() {
    const el = document.getElementById('root');
    if (!el || !el.__k) return null;
    const queue = [el.__k];
    for (let seen = 0; queue.length && seen < 500; seen++) {
      const node = queue.shift();
      if (!node) continue;
      const found = storeIn(node.props);
      if (found) return found;
      if (Array.isArray(node.__k)) {
        for (const child of node.__k) if (child && typeof child === 'object') queue.push(child);
      }
    }
    return null;
  }

  // Songsterr's own clock-to-beat map. Another shape (a format change)
  // marks the track unusable rather than flashing the wrong notes.
  function trackData(part) {
    const known = cache.get(part);
    if (known) return known.ok ? known : null;
    const data = { ok: false };
    cache.set(part, data);
    const ts = part.timestamps;
    const timeline = part.timeline;
    if (Array.isArray(ts) && ts.length && timeline && typeof timeline.get === 'function') {
      Object.assign(data, { ok: true, timestamps: ts, timeline, partId: part.partId });
    }
    return data.ok ? data : null;
  }

  // The tracks on screen: every track of the multitrack view, else the
  // current one.
  function shownParts(state) {
    const multi = state.multiPart;
    const parts = multi && multi.enabled && multi.view && multi.view.parts;
    if (Array.isArray(parts) && parts.length) return parts;
    const part = state.part && state.part.current;
    return part ? [part] : [];
  }

  // Last beat starting at or before t (binary search).
  function beatIndexAt(ts, t) {
    let lo = 0;
    let hi = ts.length - 1;
    if (t < ts[0]) return -1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ts[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  // The onset a beat's note ends on: the first later one in the same
  // measure at or past its end, else the next measure played (which can be
  // the same measure again, from its start, when it repeats).
  function endIndex(data, index, beat) {
    const ts = data.timestamps;
    const endTick = beat.startTick + beat.durationInTicks;
    for (let i = index + 1; i < ts.length; i++) {
      const entry = data.timeline.get(ts[i]);
      const other = entry && entry.beats && entry.beats[0];
      if (!other || other.measure !== beat.measure
        || other.startTick >= endTick || other.startTick <= beat.startTick) return i;
    }
    return ts.length;
  }

  function flash(data, index, speed) {
    const ts = data.timestamps;
    const entry = data.timeline.get(ts[index]);
    for (const beat of (entry && entry.beats) || []) {
      const end = endIndex(data, index, beat);
      const songMs = end < ts.length ? ts[end] - ts[index] : 500;
      flashBeat(data, beat, Math.max(60, Math.min(4000, songMs / speed)));
    }
  }

  function flashBeat(data, beat, ms) {
    if (beat.rest || !beat.layout || !beat.measure) return;
    const notes = (beat.notes || []).filter((n) => !n.rest && !n.tie && Number.isFinite(n.string));
    if (!notes.length) return;
    const x = beat.layout.absoluteX;
    const gap = (beat.layout.measureLayout && beat.layout.measureLayout.line && beat.layout.measureLayout.line.intervalSize) || 12;
    const key = `${beat.measure.index + 1}${beat.voice ? 'o' : ''}`;
    const paths = document.querySelectorAll(
      `#tablature [data-part-id="${data.partId}"] path[data-notes-measure="${key}"]`);
    for (const path of paths) {
      const parent = path.parentNode;
      if (!parent) continue;
      const clip = document.createElementNS(SVG, 'clipPath');
      clip.id = `sc-flash-clip-${++clipSeq}`;
      for (const n of notes) {
        const digits = String(n.fret ?? '').length || 1;
        const w = 4 + digits * 8;
        const r = document.createElementNS(SVG, 'rect');
        r.setAttribute('x', String(x - w / 2));
        r.setAttribute('y', String(n.string * gap - gap / 2));
        r.setAttribute('width', String(w));
        r.setAttribute('height', String(gap));
        clip.appendChild(r);
      }
      const copy = path.cloneNode(false);
      copy.removeAttribute('data-notes-measure');
      copy.setAttribute('class', 'sc-flash');
      copy.setAttribute('aria-hidden', 'true');
      copy.setAttribute('clip-path', `url(#${clip.id})`);
      copy.style.setProperty('--sc-flash-ms', `${Math.round(ms)}ms`);
      const done = () => { copy.remove(); clip.remove(); };
      copy.addEventListener('animationend', done, { once: true });
      setTimeout(done, ms + 500);   // in case no animation ran (style missing)
      parent.insertBefore(clip, path.nextSibling);
      parent.insertBefore(copy, clip.nextSibling);
    }
  }

  function clearAll() {
    for (const el of document.querySelectorAll('#tablature .sc-flash, #tablature clipPath[id^="sc-flash-clip-"]')) el.remove();
  }

  // Returns the player state when a flash should run this frame, else null.
  function activePlayer() {
    if (!enabled()) return null;
    if (!store) store = findStore();
    if (!store) return null;
    let state;
    try { state = store.get(); } catch (_) { store = null; return null; }
    const player = state && state.player;
    if (!player || !player.shouldPlay || !player.instance) return null;
    if (typeof player.instance.getCursor !== 'function') return null;
    const tracks = shownParts(state).map((p) => p && trackData(p)).filter(Boolean);
    return tracks.length ? { player, tracks } : null;
  }

  // Song ms per real ms. Starts from the speed setting, then follows the
  // clock itself (the video's real tempo with Orig.). Jumps (seeks, loops)
  // and stalls (buffering) are left out of the average.
  function clockRate(player, cursor, now) {
    const setting = Number(player.speed) > 0 ? Number(player.speed) / 100 : 1;
    if (!clock) { clock = { cursor, at: now, rate: setting }; return setting; }
    const dt = now - clock.at;
    if (dt >= 100) {
      const r = (cursor - clock.cursor) / dt;
      if (r > 0.1 && r < 4) clock.rate += (r - clock.rate) * 0.3;
      clock.cursor = cursor;
      clock.at = now;
    }
    return clock.rate;
  }

  function frame() {
    rafId = 0;
    const active = activePlayer();
    if (!active) { lastIndex.clear(); clock = null; idle(); return; }
    let cursor;
    let rate;
    try {
      cursor = active.player.instance.getCursor();
      rate = clockRate(active.player, cursor, performance.now());
    } catch (_) {
      rafId = requestAnimationFrame(frame);
      return;
    }
    for (const data of active.tracks) {
      try {
        const index = beatIndexAt(data.timestamps, cursor);
        if (index !== lastIndex.get(data.partId)) {
          lastIndex.set(data.partId, index);
          if (index >= 0) flash(data, index, rate);
        }
      } catch (_) {
        data.ok = false;
      }
    }
    rafId = requestAnimationFrame(frame);
  }

  function idle() {
    if (idleId) return;
    idleId = setTimeout(() => {
      idleId = 0;
      if (activePlayer()) rafId = rafId || requestAnimationFrame(frame);
      else idle();
    }, IDLE_MS);
  }

  // Turning the setting off removes any flash still fading.
  new MutationObserver(() => { if (!enabled()) clearAll(); })
    .observe(root, { attributes: true, attributeFilter: ['class'] });

  idle();
})();
