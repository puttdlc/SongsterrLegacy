/*
 * Classic Skin: passive metadata observer (runs in the page's MAIN world)
 * ===========================================================================
 * Songsterr's header no longer shows who wrote a tab, but the data is still in
 * the song metadata the site already downloads (/api/meta/{songId}[/{revId}],
 * field "author"). On the first page load content.js reads it from the
 * embedded <script id="state">. When you move between songs inside the
 * single-page app, that script goes stale, so this file watches the site's
 * OWN metadata responses and passes the author name to content.js.
 *
 * Guarantees:
 *   - Makes no requests of its own. It only reads a clone of a response the
 *     site requested itself.
 *   - Never changes the request, the response, or what the site receives:
 *     the original promise is returned untouched.
 *   - Forwards nothing but { songId, revisionId, latest, author: { name, profileName } }.
 *     `latest` is true for /api/meta/{songId} (the current version), false for
 *     /api/meta/{songId}/{revisionId} (one revision: history, diffs), so
 *     content.js never shows an old revision's author on the current tab.
 */
(() => {
  'use strict';

  const META_URL = /\/api\/meta\/(\d+)(?:\/(\d+))?(?:[?#]|$)/;
  const EVENT = 'sc-classic:meta';
  const original = window.fetch;
  if (typeof original !== 'function' || original.__scClassic) return;

  function urlOf(input) {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    if (input && typeof input.url === 'string') return input.url;
    return '';
  }

  function report(data, match) {
    if (!data || typeof data !== 'object' || !data.author) return;
    const { name, profileName } = data.author;
    document.dispatchEvent(new CustomEvent(EVENT, {
      detail: JSON.stringify({
        songId: data.songId ?? match[1],
        revisionId: data.revisionId ?? match[2],
        latest: !match[2],
        author: { name: String(name || ''), profileName: String(profileName || '') }
      })
    }));
  }

  function observedFetch(input, init) {
    const result = original.apply(this, arguments);
    try {
      const match = urlOf(input).match(META_URL);
      if (match) {
        result
          .then((res) => (res && res.ok ? res.clone().json() : null))
          .then((data) => report(data, match), () => {});
      }
    } catch (_) { /* never interfere with the site's request */ }
    return result;
  }
  Object.defineProperty(observedFetch, '__scClassic', { value: true });

  window.fetch = observedFetch;
})();
