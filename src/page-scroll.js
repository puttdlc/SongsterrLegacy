/*
 * Classic Skin: room above the editor's scroll target (runs in the page's MAIN world)
 * ===========================================================================
 * Songsterr scrolls a line to the window top with window.scrollBy({ top:
 * line.getBoundingClientRect().top }), assuming nothing is pinned there. Our
 * Classic quick menu bar and the Legacy favourite / display mode / editor
 * strip are, so the line ended up under them. During playback Songsterr
 * scrolls a whole line group, which base.css (multitrack.clear) already
 * extends upward by the pinned height (--sc-tab-top-clear). The editor
 * scrolls to one track's line instead ([data-part-id][data-line] inside the
 * group), which that doesn't cover: this script does. When a scrollBy would
 * put such a line's top exactly at the window top, the scroll stops short by
 * --sc-tab-top-clear, so the line lands just below what is pinned there.
 *
 * Guarantees:
 *   - Only changes the distance of a scrollBy whose target is the top of a
 *     track line; every other call, and every call while the reskin is off
 *     (--sc-tab-top-clear is 0px), goes through unchanged.
 *   - Any error falls back to the original call.
 */
(() => {
  'use strict';

  const original = window.scrollBy;
  if (typeof original !== 'function' || original.__scClassic) return;

  const GROUP = 'div[data-line-unit-index]';
  const LINE = '[data-part-id][data-line]';

  function clearPx() {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sc-tab-top-clear')) || 0;
  }

  // Is `top` (a scrollBy distance, i.e. a viewport y) the top of a track line?
  // The group's own top is left alone: its border already leaves the room.
  function isTrackLineTop(top) {
    for (const group of document.querySelectorAll(GROUP)) {
      const box = group.getBoundingClientRect();
      if (top < box.top - 1 || top > box.bottom) continue;
      if (Math.abs(box.top - top) < 1) return false;
      for (const line of group.querySelectorAll(LINE)) {
        if (Math.abs(line.getBoundingClientRect().top - top) < 1) return true;
      }
      return false;
    }
    return false;
  }

  function scrollBy(...args) {
    try {
      const options = args[0];
      if (args.length === 1 && options && typeof options === 'object' && typeof options.top === 'number') {
        const clear = clearPx();
        if (clear > 0 && isTrackLineTop(options.top)) args = [{ ...options, top: options.top - clear }];
      }
    } catch (_) { /* never interfere with the site's scroll */ }
    return original.apply(this, args);
  }
  Object.defineProperty(scrollBy, '__scClassic', { value: true });

  window.scrollBy = scrollBy;
})();
