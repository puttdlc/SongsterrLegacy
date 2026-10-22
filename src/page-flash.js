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
 * Each dependency has a source, a fallback where a safe one exists, and
 * otherwise none (no flash), like selectors.js: when something stops
 * matching, that part goes quiet and Songsterr's page is unaffected.
 *   store        Preact tree under #root                -> none
 *   clock        player.instance.getCursor()            -> none
 *   clock rate   measured from the clock                -> speed setting -> 1
 *   tracks       multiPart.view.parts (multitrack)      -> part.current -> none
 *   beat map     part.timeline (+ timestamps)           -> rebuilt from
 *                part.measures in part.progression order (only if it gives
 *                exactly one beat start per timestamp)  -> none
 *   fret path    [data-part-id=<track>] path[data-notes-measure=<n>(o)]
 *                -> #tablature path[data-notes-measure=<n>(o)] (one track
 *                shown only, so it can't pick another track's) -> none
 *   geometry     beat.layout.absoluteX, line intervalSize -> 12px -> skip
 *
 * Guarantees:
 *   - Read-only towards Songsterr: no dispatch, no patched functions.
 *   - Failures stay small: a bad beat is skipped, a track that keeps
 *     failing is dropped (the others go on), and the loop itself never
 *     stops on an error; the store is looked up again when it goes stale.
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
  const MAX_TRACK_ERRORS = 20;   // per track, before it is left out

  let store = null;
  const cache = new WeakMap(); // part -> { ok, timestamps, entryAt, partId, errors }
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

  // Beat map, source: Songsterr's own timeline (timestamp -> onset layout
  // with every voice's beats), in play order.
  function timelineMap(part, ts) {
    const timeline = part.timeline;
    if (!timeline || typeof timeline.get !== 'function') return null;
    const first = timeline.get(ts[0]);
    if (!first || !Array.isArray(first.beats)) return null;
    return (t) => timeline.get(t);
  }

  // Beat map, fallback: rebuilt from the measures in play order, one entry
  // per distinct beat start. Used only if it lines up with the timestamps
  // one to one; anything else would flash the wrong notes.
  function rebuiltMap(part, ts) {
    const measures = part.measures;
    if (!Array.isArray(measures)) return null;
    const order = Array.isArray(part.progression) ? part.progression : measures.map((_, i) => i);
    const entries = [];
    for (const mi of order) {
      const m = measures[mi];
      if (!m || !Array.isArray(m.voices)) return null;
      const byTick = new Map();
      m.voices.forEach((v, voice) => {
        for (const b of (v && v.beats) || []) {
          if (!Number.isFinite(b.startTick)) return;
          if (!byTick.has(b.startTick)) byTick.set(b.startTick, []);
          // The fields flashBeat/endIndex read, without touching Songsterr's beat.
          byTick.get(b.startTick).push(Object.assign(Object.create(b), {
            voice: Number.isFinite(b.voice) ? b.voice : voice,
            measure: b.measure && Number.isFinite(b.measure.index) ? b.measure : { index: mi, ref: m },
          }));
        }
      });
      for (const tick of [...byTick.keys()].sort((a, b) => a - b)) entries.push({ beats: byTick.get(tick) });
    }
    if (entries.length !== ts.length) return null;
    const byTime = new Map(ts.map((t, i) => [t, entries[i]]));
    return (t) => byTime.get(t);
  }

  function trackData(part) {
    const known = cache.get(part);
    if (known) return known.ok ? known : null;
    const data = { ok: false, errors: 0 };
    cache.set(part, data);
    try {
      const ts = part.timestamps;
      if (Array.isArray(ts) && ts.length && ts.every(Number.isFinite)) {
        const entryAt = timelineMap(part, ts) || rebuiltMap(part, ts);
        if (entryAt) Object.assign(data, { ok: true, timestamps: ts, entryAt, partId: part.partId });
      }
    } catch (_) { /* none: no flash for this track */ }
    return data.ok ? data : null;
  }

  // Tracks, source: every track of the multitrack view; fallback: the
  // current track (also when none of the multitrack ones is usable).
  function shownTracks(state) {
    let tracks = [];
    try {
      const multi = state.multiPart;
      const parts = multi && multi.enabled && multi.view && multi.view.parts;
      if (Array.isArray(parts)) tracks = parts.map((p) => p && trackData(p)).filter(Boolean);
    } catch (_) { tracks = []; }
    if (!tracks.length) {
      try {
        const data = state.part && state.part.current && trackData(state.part.current);
        if (data) tracks = [data];
      } catch (_) { /* none */ }
    }
    return tracks;
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

  function sameMeasure(a, b) {
    return a === b || (a && b && a.ref !== undefined && a.ref === b.ref);
  }

  // The onset a beat's note ends on: the first later one in the same
  // measure at or past its end, else the next measure played (which can be
  // the same measure again, from its start, when it repeats).
  function endIndex(data, index, beat) {
    const ts = data.timestamps;
    const endTick = beat.startTick + beat.durationInTicks;
    if (!Number.isFinite(endTick)) return index + 1;
    for (let i = index + 1; i < ts.length; i++) {
      const entry = data.entryAt(ts[i]);
      const other = entry && entry.beats && entry.beats[0];
      if (!other || !sameMeasure(other.measure, beat.measure)
        || other.startTick >= endTick || other.startTick <= beat.startTick) return i;
    }
    return ts.length;
  }

  function flash(data, index, speed, single) {
    const ts = data.timestamps;
    const entry = data.entryAt(ts[index]);
    for (const beat of (entry && entry.beats) || []) {
      try {
        const end = endIndex(data, index, beat);
        const songMs = end < ts.length ? ts[end] - ts[index] : 500;
        flashBeat(data, beat, Math.max(60, Math.min(4000, songMs / speed)), single);
      } catch (_) {
        data.errors++;   // skip this beat only
      }
    }
  }

  // Fret path, source: inside the track's own group; fallback (one track
  // shown): any in #tablature; else none.
  function fretPaths(data, key, single) {
    const scoped = document.querySelectorAll(
      `#tablature [data-part-id="${data.partId}"] path[data-notes-measure="${key}"]`);
    if (scoped.length || !single) return scoped;
    return document.querySelectorAll(`#tablature path[data-notes-measure="${key}"]`);
  }

  function flashBeat(data, beat, ms, single) {
    if (!beat || beat.rest || !beat.layout || !beat.measure) return;
    const x = beat.layout.absoluteX;
    const index = beat.measure.index;
    if (!Number.isFinite(x) || !Number.isFinite(index)) return;
    const notes = (beat.notes || []).filter((n) => n && !n.rest && !n.tie && Number.isFinite(n.string));
    if (!notes.length) return;
    const line = beat.layout.measureLayout && beat.layout.measureLayout.line;
    const gap = (line && Number(line.intervalSize)) || 12;
    const paths = fretPaths(data, `${index + 1}${beat.voice ? 'o' : ''}`, single);
    for (const path of paths) {
      const parent = path.parentNode;
      if (!parent) continue;
      const clip = document.createElementNS(SVG, 'clipPath');
      clip.id = `sc-flash-clip-${++clipSeq}`;
      for (const n of notes) {
        // Digits are ~7px each; a ghost note's brackets reach ~9px (one
        // digit) or ~12px (two) out from the centre.
        const digits = String(Math.abs(Number(n.fret) || 0)).length;
        const w = n.ghost ? (digits > 1 ? 26 : 20) : 4 + digits * 8;
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

  function readState() {
    if (!store) store = findStore();
    if (!store) return null;
    try {
      const state = store.get();
      if (state && state.player) return state;
    } catch (_) { /* stale: look it up again */ }
    store = null;
    return null;
  }

  // Returns the player state when a flash should run this frame, else null.
  function activePlayer() {
    if (!enabled()) return null;
    const state = readState();
    const player = state && state.player;
    if (!player || !player.shouldPlay || !player.instance) return null;
    if (typeof player.instance.getCursor !== 'function') return null;
    const tracks = shownTracks(state);
    return tracks.length ? { player, tracks } : null;
  }

  // Song ms per real ms. Starts from the speed setting (else 1), then
  // follows the clock itself (the video's real tempo with Orig.). Jumps
  // (seeks, loops) and stalls (buffering) are left out of the average.
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

  function step(active) {
    const cursor = Number(active.player.instance.getCursor());
    if (!Number.isFinite(cursor)) return;
    const rate = clockRate(active.player, cursor, performance.now());
    const single = active.tracks.length === 1;
    for (const data of active.tracks) {
      try {
        const index = beatIndexAt(data.timestamps, cursor);
        if (index !== lastIndex.get(data.partId)) {
          lastIndex.set(data.partId, index);
          if (index >= 0) flash(data, index, rate, single);
        }
      } catch (_) {
        data.errors++;
      }
      if (data.errors > MAX_TRACK_ERRORS) data.ok = false;   // left out from the next frame
    }
  }

  function frame() {
    rafId = 0;
    let active = null;
    try {
      active = activePlayer();
      if (active) step(active);
    } catch (_) { /* this frame only */ }
    if (active) rafId = requestAnimationFrame(frame);
    else { lastIndex.clear(); clock = null; idle(); }
  }

  function idle() {
    if (idleId) return;
    idleId = setTimeout(() => {
      idleId = 0;
      let active = null;
      try { active = activePlayer(); } catch (_) { /* try again next tick */ }
      if (active) rafId = rafId || requestAnimationFrame(frame);
      else idle();
    }, IDLE_MS);
  }

  // Turning the setting off removes any flash still fading.
  new MutationObserver(() => { if (!enabled()) clearAll(); })
    .observe(root, { attributes: true, attributeFilter: ['class'] });

  idle();
})();
