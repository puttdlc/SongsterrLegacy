/*
 * Classic Skin: tab author reader (runs in the page's MAIN world)
 * ===========================================================================
 * Songsterr's header no longer shows who wrote a tab, but the page already
 * holds it: its in-memory store has meta.current.author. On the first page
 * load content.js reads it from the embedded <script id="state">. When you
 * move between songs inside the single-page app, that script goes stale, so
 * this file reads the store and passes the author name to content.js.
 *
 * Guarantees:
 *   - Makes no requests and watches none; no function of the page is patched.
 *   - Read-only: never dispatches to the store or changes anything in it.
 *   - Forwards nothing but { songId, revisionId, latest, author: { name, profileName } },
 *     and only when that changes. `latest` is true only when the address is
 *     that song with no revision in it, so content.js doesn't show an old
 *     revision's author on the current tab.
 *   - If the store can't be found or changes shape, no author is shown.
 */
(() => {
  'use strict';

  const EVENT = 'sc-classic:meta';
  const POLL_MS = 500;
  const PAGE = /-s(\d+)(?:t\d+)?(?:\/r(\d+))?\/?$/;
  const oldViews = new Set();   // revision ids opened by a /r<id> address
  let store = null;
  let sent = '';

  function storeIn(props) {
    if (!props) return null;
    for (const key of ['store', 'context', 'value']) {
      const s = props[key];
      if (s && typeof s.get === 'function' && typeof s.dispatch === 'function') return s;
    }
    return null;
  }

  // Not a global: found in the Preact tree, as page-flash.js does.
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

  function currentMeta() {
    if (!store) store = findStore();
    if (!store) return null;
    try {
      const meta = store.get()?.meta;
      if (meta) return meta.current || null;
    } catch (_) { /* stale: look it up again */ }
    store = null;
    return null;
  }

  function check() {
    try {
      const current = currentMeta();
      if (!current || !current.author || current.songId == null) return;
      const { songId, revisionId } = current;
      const page = location.pathname.match(PAGE);
      const here = Boolean(page) && page[1] === String(songId);
      if (here && page[2] === String(revisionId)) oldViews.add(page[2]);
      // Just after leaving a revision's address the store can still hold that
      // revision: never call one of those the current version.
      const latest = here && !page[2] && !oldViews.has(String(revisionId));
      const { name, profileName } = current.author;
      const detail = JSON.stringify({
        songId, revisionId, latest,
        author: { name: String(name || ''), profileName: String(profileName || '') }
      });
      if (detail === sent) return;
      sent = detail;
      document.dispatchEvent(new CustomEvent(EVENT, { detail }));
    } catch (_) { /* never disturb the page */ }
  }

  setInterval(check, POLL_MS);
})();
