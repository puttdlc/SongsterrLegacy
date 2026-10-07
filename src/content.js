/*
 * Songsterr Classic: content script
 * ==================================
 * All styling is plain CSS (declared in manifest.json) scoped under
 * html.sc-enabled. This script only:
 *   1. puts the right classes on <html> as early as possible,
 *   2. keeps them in sync with chrome.storage.sync (live, no reload),
 *   3. re-adds them if the page ever strips them (SPA safety net),
 *   4. answers the popup's "Check selectors" request.
 * It never touches Songsterr's own DOM, state, network or feature logic.
 */
(() => {
  'use strict';

  const DEFAULTS = Object.freeze({
    enabled: true,
    theme: 'dark',          // dark | light | auto
    density: 'compact',     // compact | comfortable
    toneDownPromos: false
  });
  const VALID = {
    theme: ['dark', 'light', 'auto'],
    density: ['compact', 'comfortable']
  };
  // Mirror of the last-known settings in the page's localStorage. It is read
  // synchronously at document_start so the right theme paints on the first
  // frame; chrome.storage stays the source of truth.
  const MIRROR_KEY = 'sc-classic:settings';

  const root = document.documentElement;
  let settings = { ...DEFAULTS };
  let wanted = [];

  function normalize(raw) {
    const s = { ...DEFAULTS, ...(raw || {}) };
    s.enabled = s.enabled !== false;
    s.toneDownPromos = s.toneDownPromos === true;
    if (!VALID.theme.includes(s.theme)) s.theme = DEFAULTS.theme;
    if (!VALID.density.includes(s.density)) s.density = DEFAULTS.density;
    return s;
  }

  function classesFor(s) {
    if (!s.enabled) return [];
    const list = ['sc-enabled', `sc-theme-${s.theme}`, `sc-density-${s.density}`];
    if (s.toneDownPromos) list.push('sc-tone-promos');
    return list;
  }

  function syncClasses() {
    for (const c of Array.from(root.classList)) {
      if (c.startsWith('sc-') && !wanted.includes(c)) root.classList.remove(c);
    }
    for (const c of wanted) {
      if (!root.classList.contains(c)) root.classList.add(c);
    }
  }

  function apply(raw) {
    settings = normalize(raw);
    wanted = classesFor(settings);
    syncClasses();
    try {
      localStorage.setItem(MIRROR_KEY, JSON.stringify(settings));
    } catch (_) { /* storage blocked: first paint just uses defaults */ }
  }

  // 1. First paint: mirrored settings (or defaults), synchronously.
  let mirrored = null;
  try {
    mirrored = JSON.parse(localStorage.getItem(MIRROR_KEY) || 'null');
  } catch (_) { /* ignore */ }
  apply(mirrored);

  // 2. Source of truth + live updates.
  try {
    chrome.storage.sync.get(DEFAULTS).then(apply, () => {});
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      const next = { ...settings };
      for (const [key, { newValue }] of Object.entries(changes)) {
        if (key in DEFAULTS) next[key] = newValue === undefined ? DEFAULTS[key] : newValue;
      }
      apply(next);
    });
  } catch (_) { /* extension context gone (e.g. reloaded); keep last classes */ }

  // 3. Safety net: Songsterr is a single-page app. It does not currently
  // rewrite <html class>, but if a future build does, put ours back. Only
  // watches the class attribute of <html>, coalesced to one frame.
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      if (wanted.some((c) => !root.classList.contains(c))) syncClasses();
    });
  }).observe(root, { attributes: true, attributeFilter: ['class'] });

  // 4. Popup diagnostics.
  try {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.type !== 'sc:diagnose') return;
      sendResponse({
        ok: true,
        path: location.pathname,
        enabled: settings.enabled,
        results: typeof globalThis.scDiagnose === 'function' ? globalThis.scDiagnose() : []
      });
    });
  } catch (_) { /* ignore */ }
})();
