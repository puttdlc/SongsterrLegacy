/*
 * Classic Skin: content script
 * ==================================
 * All styling is plain CSS (declared in manifest.json) scoped under
 * html.sc-enabled. This script only:
 *   1. puts the right classes on <html> as early as possible,
 *   2. keeps them in sync with chrome.storage.sync (live, no reload),
 *   3. re-adds them if the page ever strips them (SPA safety net),
 *   4. adds a collapse toggle for the bottom nav bar (our own element, placed
 *      outside Songsterr's app root) and a minimise toggle for the player pane
 *      (appended to the favourite / display-mode / editor strip),
 *   5. shows the tab author as a "Last edited by <name>" link under the song title,
 *   6. in the Classic layout, feeds the track name to the track selector and
 *      measures the right-hand strip so the bar can make room for it,
 *   7. answers the popup's "Check selectors" request.
 * It never changes Songsterr's own state, requests or feature logic.
 */
(() => {
  'use strict';

  const DEFAULTS = Object.freeze({
    enabled: true,
    layout: 'fusion',       // fusion | classic
    accent: 'auto',         // auto | blue | green | red | custom | off
    accentCustom: '#2f9e44', // #rrggbb, used when accent = custom
    theme: 'dark',          // dark | light | auto
    density: 'compact',     // compact | comfortable
    showAuthor: true,
    navCollapsed: false,
    paneMinimized: false
  });
  const VALID = {
    layout: ['fusion', 'classic'],
    accent: ['auto', 'blue', 'green', 'red', 'custom', 'off'],
    theme: ['dark', 'light', 'auto'],
    density: ['compact', 'comfortable']
  };
  const BOOLEANS = ['showAuthor', 'navCollapsed', 'paneMinimized'];
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
    for (const key of BOOLEANS) s[key] = typeof s[key] === 'boolean' ? s[key] : DEFAULTS[key];
    if (!VALID.layout.includes(s.layout)) s.layout = DEFAULTS.layout;
    if (!VALID.accent.includes(s.accent)) s.accent = DEFAULTS.accent;
    if (!/^#[0-9a-f]{6}$/i.test(String(s.accentCustom))) s.accentCustom = DEFAULTS.accentCustom;
    if (!VALID.theme.includes(s.theme)) s.theme = DEFAULTS.theme;
    if (!VALID.density.includes(s.density)) s.density = DEFAULTS.density;
    return s;
  }

  /** "auto" (never picked in the popup) = each layout's own look: Classic
   *  green like the old player, Fusion blue. */
  function accentFor(s) {
    if (s.accent !== 'auto') return s.accent;
    return s.layout === 'classic' ? 'green' : 'blue';
  }

  // The custom colour is the one value CSS can't hold as a class, so it goes
  // on <html> as an inline custom property (tokens.css derives the rest).
  function syncAccentColor() {
    const value = settings.enabled && accentFor(settings) === 'custom' ? settings.accentCustom : '';
    if (root.style.getPropertyValue('--sc-accent-base') === value) return;
    if (value) root.style.setProperty('--sc-accent-base', value);
    else root.style.removeProperty('--sc-accent-base');
  }

  function classesFor(s) {
    if (!s.enabled) return [];
    const list = ['sc-enabled', `sc-layout-${s.layout}`, `sc-accent-${accentFor(s)}`,
      `sc-theme-${s.theme}`, `sc-density-${s.density}`];
    if (s.showAuthor) list.push('sc-show-author');
    if (s.navCollapsed) list.push('sc-nav-collapsed');
    // Minimising only exists in Fusion; Classic is a single fixed bar.
    if (s.paneMinimized && s.layout === 'fusion') list.push('sc-pane-min');
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
    syncAccentColor();
    updateNavToggle();
    updatePaneToggle();
    schedule();
    try {
      localStorage.setItem(MIRROR_KEY, JSON.stringify(settings));
    } catch (_) { /* storage blocked: first paint just uses defaults */ }
  }

  function save(patch) {
    apply({ ...settings, ...patch });
    try {
      chrome.storage.sync.set(patch);
    } catch (_) { /* extension reloaded; the class change still applies here */ }
  }

  // ---------------------------------------------------------------------------
  // Nav collapse toggle (selectors.js: nav.toggle)
  // ---------------------------------------------------------------------------
  const NAV_SELECTOR = '[class*="_bottomBarWide"]';
  let navToggle = null;

  /** Small stroked chevron; `d` is the path, w/h the viewBox size. */
  function chevron(d, w, h) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
    return svg;
  }

  function buildNavToggle() {
    const btn = document.createElement('button');
    btn.id = 'sc-nav-toggle';
    btn.type = 'button';
    btn.hidden = true;
    btn.append(chevron('M6 1 1.5 6 6 11', 8, 12));
    btn.addEventListener('click', () => save({ navCollapsed: !settings.navCollapsed }));
    return btn;
  }

  function updateNavToggle() {
    if (!navToggle) return;
    const collapsed = settings.navCollapsed;
    const label = collapsed ? 'Show navigation bar' : 'Hide navigation bar';
    navToggle.setAttribute('aria-expanded', String(!collapsed));
    navToggle.setAttribute('aria-label', label);
    navToggle.title = label;
  }

  function syncNavToggle() {
    if (!document.body) return;
    if (!navToggle) {
      navToggle = buildNavToggle();
      updateNavToggle();
    }
    // Lives outside Songsterr's #root so the app's renderer never touches it.
    if (navToggle.parentNode !== document.body) document.body.append(navToggle);
    const nav = document.querySelector(NAV_SELECTOR);
    const navShown = !!nav &&
      nav.getAttribute('data-ready') !== 'false' &&
      getComputedStyle(nav).display !== 'none';
    // Only offer the toggle while the nav bar itself can be shown.
    if (navToggle.hidden === navShown) navToggle.hidden = !navShown;
  }

  // ---------------------------------------------------------------------------
  // Player pane minimise toggle (selectors.js: toolbar.minimize)
  // A third collapse level on top of Songsterr's own expand/collapse: the
  // button rows slide away and only the favourite / display-mode / editor
  // strip stays, docked in the corner. The toggle lives at the end of that
  // strip. CSS only hides the pane while this toggle is in the page, so if a
  // Songsterr update removes the strip, the pane can never get stuck hidden.
  // ---------------------------------------------------------------------------
  const TOP_STRIP = '[data-controls-top-panel] > [class*="_controlsTopPanel"]';
  let paneToggle = null;

  function buildPaneToggle() {
    const btn = document.createElement('button');
    btn.id = 'sc-pane-toggle';
    btn.type = 'button';
    btn.setAttribute('aria-controls', 'controls');
    btn.append(chevron('M1 1.5 6 6.5 11 1.5', 12, 8));
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      save({ paneMinimized: !settings.paneMinimized });
    });
    return btn;
  }

  function updatePaneToggle() {
    if (!paneToggle) return;
    const min = settings.paneMinimized;
    const label = min ? 'Show player controls' : 'Minimise player controls';
    paneToggle.setAttribute('aria-expanded', String(!min));
    paneToggle.setAttribute('aria-label', label);
    paneToggle.title = label;
  }

  function syncPaneToggle() {
    const strip = document.querySelector(TOP_STRIP);
    if (!strip || !settings.enabled || settings.layout !== 'fusion') {
      if (paneToggle && paneToggle.isConnected) paneToggle.remove();
      return;
    }
    if (!paneToggle) {
      paneToggle = buildPaneToggle();
      updatePaneToggle();
    }
    if (paneToggle.parentNode !== strip || strip.lastChild !== paneToggle) strip.append(paneToggle);
  }

  // ---------------------------------------------------------------------------
  // Author (selectors.js: header.author). Data sources, no requests made:
  //   - <script id="state"> embedded in the first page load (meta.current.author)
  //   - "sc-classic:meta" events from page-meta.js, which reads the site's own
  //     /api/meta responses during in-app navigation.
  // Rendered as our own <div id="sc-author"> appended to #header (after the
  // site's children, so Songsterr's renderer keeps its own nodes in order).
  // The link goes to the author's public profile, /user/<profileName>, the
  // same URL Songsterr uses in its revision list.
  // ---------------------------------------------------------------------------
  const authors = new Map(); // songId -> { name, profileName }
  let stateRead = false;
  let authorEl = null;

  function rememberAuthor(songId, author) {
    if (songId == null || !author) return;
    const name = String(author.name || author.profileName || '').trim().slice(0, 80);
    const profileName = String(author.profileName || '').trim().slice(0, 80);
    if (name) authors.set(String(songId), { name, profileName });
  }

  function readEmbeddedState() {
    if (stateRead) return;
    const el = document.getElementById('state');
    if (!el) return;
    stateRead = true;
    try {
      const current = JSON.parse(el.textContent || '{}')?.meta?.current;
      if (current) rememberAuthor(current.songId, current.author);
    } catch (_) { /* malformed or changed format: no author shown */ }
  }

  document.addEventListener('sc-classic:meta', (event) => {
    try {
      const data = JSON.parse(event.detail);
      rememberAuthor(data.songId, data.author);
      schedule();
    } catch (_) { /* ignore */ }
  });

  function songIdFromUrl() {
    // /a/wsa/metallica-enter-sandman-tab-s19, ...-s19t2, ...-sheet-s19,
    // ...-s84335t4/r93259 (a specific revision)
    const m = location.pathname.match(/-s(\d+)(?:t\d+)?(?:\/r\d+)?\/?$/);
    if (!m || /-chords-s\d+/.test(location.pathname)) return null;
    return m[1];
  }

  function buildAuthor() {
    const el = document.createElement('div');
    el.id = 'sc-author';
    el.append('Last edited by ');
    const link = document.createElement('a');
    el.append(link);
    return el;
  }

  function syncAuthor() {
    readEmbeddedState();
    const header = document.getElementById('header');
    const id = songIdFromUrl();
    const info = id ? authors.get(id) : undefined;
    if (!header || !info || !settings.enabled || !settings.showAuthor) {
      if (authorEl && authorEl.isConnected) authorEl.remove();
      return;
    }
    if (!authorEl) authorEl = buildAuthor();
    const link = authorEl.lastChild;
    if (link.textContent !== info.name) link.textContent = info.name;
    const href = info.profileName ? `/user/${encodeURIComponent(info.profileName)}` : '';
    if (href) {
      if (link.getAttribute('href') !== href) link.setAttribute('href', href);
      link.title = `${info.name}'s profile`;
    } else {
      link.removeAttribute('href');
      link.removeAttribute('title');
    }
    // Prefer the header's empty, centred "info" slot under the title; fall back
    // to the end of #header if a future build drops it.
    const slot = header.querySelector(':scope > [class*="_wrap"] > [class*="_info"]') || header;
    if (authorEl.parentNode !== slot || slot.lastChild !== authorEl) slot.append(authorEl);
  }

  // ---------------------------------------------------------------------------
  // Classic layout (classic.css)
  // The track selector shows "<instrument>" over "<track name>", as the old
  // player did. Songsterr's mixer button only carries an icon, but the page
  // title always names the current track:
  //   "<Song> Tab by <Artist> - <Track name> - <Instrument> | Songsterr ..."
  // so both are read from there (counted from the end, so a " - " in the song
  // name does no harm) and handed to CSS as data attributes on the button.
  // Setting attributes Songsterr's renderer doesn't own leaves its state alone.
  // The favourite / display-mode / editor strip sits over the right end of
  // the bar; its width is published as --sc-classic-strip-w so the button
  // row stops short of it.
  // ---------------------------------------------------------------------------
  const TRACK_ATTRS = ['data-sc-instrument', 'data-sc-track'];

  function trackFromTitle() {
    const parts = document.title.split(' | ')[0].split(' - ');
    if (parts.length < 3) return null;
    return { instrument: parts[parts.length - 1].trim(), track: parts[parts.length - 2].trim() };
  }

  function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }

  function syncClassic() {
    const classic = settings.enabled && settings.layout === 'classic';
    const mixer = document.getElementById('control-mixer');
    if (mixer) {
      const info = classic ? trackFromTitle() : null;
      if (classic) {
        setAttr(mixer, 'data-sc-instrument', info ? info.instrument.slice(0, 80) : 'Tracks');
        setAttr(mixer, 'data-sc-track', info ? info.track.slice(0, 80) : '');
      } else {
        for (const name of TRACK_ATTRS) if (mixer.hasAttribute(name)) mixer.removeAttribute(name);
      }
    }
    const strip = classic ? document.querySelector(TOP_STRIP) : null;
    const width = strip ? `${Math.ceil(strip.getBoundingClientRect().width)}px` : '';
    if (root.style.getPropertyValue('--sc-classic-strip-w') !== width) {
      if (width) root.style.setProperty('--sc-classic-strip-w', width);
      else root.style.removeProperty('--sc-classic-strip-w');
    }
  }

  // ---------------------------------------------------------------------------
  // Upkeep, coalesced. Songsterr is a single-page app and re-renders often
  // (the playback cursor animates constantly), so DOM changes only schedule
  // one cheap pass at most every 250ms.
  // ---------------------------------------------------------------------------
  let timer = 0;
  function schedule() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = 0;
      if (wanted.some((c) => !root.classList.contains(c))) syncClasses();
      syncNavToggle();
      syncPaneToggle();
      syncAuthor();
      syncClassic();
    }, 250);
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

  // 3. Safety net + upkeep triggers.
  new MutationObserver(schedule).observe(root, {
    attributes: true,
    attributeFilter: ['class', 'data-ready', 'data-plus'],
    childList: true,
    subtree: true
  });
  window.addEventListener('popstate', schedule);
  window.addEventListener('resize', schedule);
  document.addEventListener('DOMContentLoaded', schedule);
  schedule();

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
