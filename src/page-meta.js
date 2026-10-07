/*
 * Songsterr Classic: passive metadata observer (runs in the page's MAIN world)
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
 *   - Forwards nothing but { songId, revisionId, author: { name, profileName } }.
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

  function report(data) {
    if (!data || typeof data !== 'object' || !data.author) return;
    const { name, profileName } = data.author;
    document.dispatchEvent(new CustomEvent(EVENT, {
      detail: JSON.stringify({
        songId: data.songId,
        revisionId: data.revisionId,
        author: { name: String(name || ''), profileName: String(profileName || '') }
      })
    }));
  }

  function observedFetch(input, init) {
    const result = original.apply(this, arguments);
    try {
      if (META_URL.test(urlOf(input))) {
        result
          .then((res) => (res && res.ok ? res.clone().json() : null))
          .then(report, () => {});
      }
    } catch (_) { /* never interfere with the site's request */ }
    return result;
  }
  Object.defineProperty(observedFetch, '__scClassic', { value: true });

  window.fetch = observedFetch;
})();
