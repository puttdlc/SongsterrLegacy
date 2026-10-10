/*
 * Classic Skin: content script
 * ==================================
 * All styling is plain CSS (declared in manifest.json) scoped under
 * html.sc-enabled. This script only:
 *   1. puts the right classes on <html> as early as possible,
 *   2. keeps them in sync with chrome.storage.sync (live, no reload),
 *   3. re-adds them if the page ever strips them (SPA safety net),
 *   4. adds a collapse toggle for the bottom nav bar and one for the floating
 *      video panel (our own elements, placed outside Songsterr's app root) and
 *      a minimise toggle for the player pane (appended to the favourite /
 *      display-mode / editor strip),
 *   5. shows the tab author as a "Last edited by <name>" link under the song title,
 *   6. in the Classic layout, feeds the track name to the track selector and
 *      measures the right-hand strip so the bar can make room for it,
 *   7. keeps Songsterr's player panel open once the user opens it (Fusion),
 *   8. answers the popup's "Check selectors" request.
 * It never changes Songsterr's own state, requests or feature logic.
 */
(() => {
  'use strict';

  const DEFAULTS = Object.freeze({
    enabled: true,
    layout: 'minimal',      // Controls: minimal (shown as "Legacy") | classic | fusion
    navLayout: 'minimal',   // Quick menu: classic (top bar) | fusion (bottom-left dock) | minimal (left sidebar)
    classicBar: 'spread',   // Classic controls: spread (labels, equal spacing) | icons (packed, no labels)
    accent: 'auto',         // auto | blue | green | red | custom | off
    accentCustom: '#2f9e44', // #rrggbb, used when accent = custom
    theme: 'dark',          // dark | light | auto
    density: 'compact',     // compact | comfortable
    showAuthor: true,
    navCollapsed: false,
    paneMinimized: false,
    videoCollapsed: false,  // Classic / Legacy: synced-video panel slid off to the right
    keepOpen: true          // Fusion: undo Songsterr folding the player on its own
  });
  const VALID = {
    layout: ['fusion', 'classic', 'minimal'],
    navLayout: ['fusion', 'classic', 'minimal'],
    classicBar: ['spread', 'icons'],
    accent: ['auto', 'blue', 'green', 'red', 'custom', 'off'],
    theme: ['dark', 'light', 'auto'],
    density: ['compact', 'comfortable']
  };
  const BOOLEANS = ['showAuthor', 'navCollapsed', 'paneMinimized', 'videoCollapsed', 'keepOpen'];
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
    if (!VALID.navLayout.includes(s.navLayout)) s.navLayout = DEFAULTS.navLayout;
    if (!VALID.classicBar.includes(s.classicBar)) s.classicBar = DEFAULTS.classicBar;
    if (!VALID.accent.includes(s.accent)) s.accent = DEFAULTS.accent;
    if (!/^#[0-9a-f]{6}$/i.test(String(s.accentCustom))) s.accentCustom = DEFAULTS.accentCustom;
    if (!VALID.theme.includes(s.theme)) s.theme = DEFAULTS.theme;
    if (!VALID.density.includes(s.density)) s.density = DEFAULTS.density;
    return s;
  }

  /** "auto" (never picked in the popup) = each layout's own look: Classic
   *  green like the old player, Fusion and Legacy blue. */
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
    const list = ['sc-enabled', `sc-layout-${s.layout}`, `sc-menu-${s.navLayout}`, `sc-accent-${accentFor(s)}`,
      `sc-theme-${s.theme}`, `sc-density-${s.density}`];
    if (s.showAuthor) list.push('sc-show-author');
    // Collapsing only exists for the Fusion quick menu (bottom-left dock).
    if (s.navCollapsed && s.navLayout === 'fusion') list.push('sc-nav-collapsed');
    // Minimising only exists in Fusion; Classic and Legacy are fixed bars.
    if (s.paneMinimized && s.layout === 'fusion') list.push('sc-pane-min');
    // Fusion keeps the video panel inside its pane (minimised with it).
    if (s.videoCollapsed && s.layout !== 'fusion') list.push('sc-video-collapsed');
    if (s.layout === 'classic') list.push(`sc-bar-${s.classicBar}`, ...CLASSIC_LEVELS[classicLevel]);
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
    updateVideoToggle();
    syncKeepOpen();
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
    const navShown = settings.navLayout === 'fusion' && !!nav &&
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
  // Video panel collapse toggle (selectors.js: video.toggle)
  // Classic and Legacy float Songsterr's synced-video / audio-mix panel over
  // the page (classic.video, minimal.video), where it can cover the tab. This
  // tab slides it away and back (Classic: on its top edge, down behind the
  // player bar; Legacy: on its left edge, off to the right); the video keeps
  // playing. Its height is published as --sc-video-h for the Classic tab. It lives in <body>, outside Songsterr's app root, and is only
  // shown while the panel is; CSS only hides the panel while the tab is
  // shown, so the panel can never get stuck hidden.
  // ---------------------------------------------------------------------------
  const VIDEO_PANEL = '#controls > div:not(#controls-panel-handle, [class*="_controlsCard"]):has(> [class*="_panel"]:not([class*="_panelHidden"]))';
  let videoToggle = null;

  function buildVideoToggle() {
    const btn = document.createElement('button');
    btn.id = 'sc-video-toggle';
    btn.type = 'button';
    btn.hidden = true;
    btn.append(chevron('M2 1 6.5 6 2 11', 8, 12));
    btn.addEventListener('click', () => save({ videoCollapsed: !settings.videoCollapsed }));
    return btn;
  }

  function updateVideoToggle() {
    if (!videoToggle) return;
    const collapsed = settings.videoCollapsed;
    const label = collapsed ? 'Show video panel' : 'Hide video panel';
    videoToggle.setAttribute('aria-expanded', String(!collapsed));
    videoToggle.setAttribute('aria-label', label);
    videoToggle.title = label;
  }

  function syncVideoToggle() {
    if (!document.body) return;
    if (!videoToggle) {
      videoToggle = buildVideoToggle();
      updateVideoToggle();
    }
    if (videoToggle.parentNode !== document.body) document.body.append(videoToggle);
    const panel = settings.enabled && settings.layout !== 'fusion' ? document.querySelector(VIDEO_PANEL) : null;
    if (videoToggle.hidden === !!panel) videoToggle.hidden = !panel;
    // Classic puts the tab on the panel's top edge, so CSS needs its height.
    // Measure the panel itself: the wrapper around it has extra room for the
    // shadow. Not affected while slid away (translate doesn't change layout).
    const inner = panel && panel.querySelector(':scope > [class*="_panel"]');
    const height = inner ? `${Math.ceil(inner.getBoundingClientRect().height)}px` : '';
    if (root.style.getPropertyValue('--sc-video-h') !== height) {
      if (height) root.style.setProperty('--sc-video-h', height);
      else root.style.removeProperty('--sc-video-h');
    }
  }

  // ---------------------------------------------------------------------------
  // Legacy popups beside the sidebar and the button column
  // (minimal-menu.css minimalMenu.popups, minimal.css minimal.mixer)
  // Help, Inbox and Account (left sidebar) and the track list, transpose and
  // settings windows (right column) open level with their button: each
  // popup's top is published as --sc-pop-<button id> on <html>, pushed up
  // just enough that the popup stays on screen. Runs in the next animation
  // frame after a DOM change (placePopups: before the new popup is painted,
  // and once per frame however many changes came in), not from the 250ms
  // upkeep, so a popup never shows in the wrong place first.
  // The column's other popups (speed, loop, print ...) are aligned in CSS
  // (minimal.anchoredPopups), from Songsterr's own --anchor-bottom.
  // ---------------------------------------------------------------------------
  const LEGACY_POPUPS = [
    // [popup selector, button id, which setting must be "minimal"]
    ['#help-menu:not([class*="_detached"])', 'menu-help', 'navLayout'],
    ['#inbox-popup', 'menu-inbox', 'navLayout'],
    ['#profile-popup-desktop', 'menu-account', 'navLayout'],
    ['#default-mixer', 'control-mixer', 'layout'],
    ['[class*="_transposeNotation"]', 'control-transpose', 'layout'],
    ['#settings-popup', 'control-settings', 'layout']
  ];
  const POPUP_MARGIN = 8;

  function insetPx(name) {
    return parseFloat(getComputedStyle(root).getPropertyValue(name)) || 0;
  }

  function placeLegacyPopups() {
    if (!settings.enabled) return;
    for (const [selector, buttonId, key] of LEGACY_POPUPS) {
      if (settings[key] !== 'minimal') continue;
      const popup = document.querySelector(selector);
      const button = popup && document.getElementById(buttonId);
      if (!button) continue;
      // The sidebar spans the window (minus the Classic player bar); the
      // column starts below the Classic menu bar.
      const highest = key === 'layout' ? insetPx('--sc-top-inset') : POPUP_MARGIN;
      const lowest = window.innerHeight - insetPx('--sc-bottom-inset') - POPUP_MARGIN - popup.offsetHeight;
      const top = `${Math.round(Math.max(highest, Math.min(button.getBoundingClientRect().top, lowest)))}px`;
      const name = `--sc-pop-${buttonId}`;
      if (root.style.getPropertyValue(name) !== top) root.style.setProperty(name, top);
    }
  }

  // ---------------------------------------------------------------------------
  // Classic popups over their button (classic.css, classic.popups)
  // Songsterr opens a toolbar button's popup (speed, download, transpose,
  // settings, Plus upsells ...) at the pane's right edge, which in the
  // full-width bar is far from the button, and some (the Plus panels:
  // speed, download ...) reach the screen's bottom edge, over the bar. Every
  // popup is marked data-sc-pop (CSS stands it on the bar), and one that
  // appears within a moment of a click on a bar button is also marked
  // data-sc-anchored and given --sc-pop-x (inline, on that element): centred
  // over the button, kept inside the window. Like the Legacy popups this runs
  // from placePopups, before the popup is painted. Popups opened with a
  // keyboard shortcut keep Songsterr's own placement.
  // ---------------------------------------------------------------------------
  const ANCHOR_WINDOW_MS = 1500;
  let lastControl = null;
  let lastControlAt = 0;

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target && target.closest('#controls [id^="control-"]');
    if (button) {
      lastControl = button;
      lastControlAt = Date.now();
    }
  }, true);

  function placeClassicPopups() {
    if (!settings.enabled || settings.layout !== 'classic') return;
    const layer = document.querySelector('#tab-controls [class*="_popupsLayer"]');
    if (!layer || !layer.firstElementChild) return;
    const fresh = lastControl && lastControl.isConnected && Date.now() - lastControlAt < ANCHOR_WINDOW_MS;
    for (const el of layer.querySelectorAll(':scope > *, :scope > * > *')) {
      if (el.id === 'default-mixer' || el.hasAttribute('data-sc-pop')) continue;   // mixer: classic.mixer
      if (getComputedStyle(el).position !== 'fixed') continue;
      const width = el.offsetWidth;
      if (!width || width > window.innerWidth * 0.9) continue;                      // full-screen overlays
      el.setAttribute('data-sc-pop', '');   // sits on the bar (classic.popups)
      if (!fresh) continue;
      const b = lastControl.getBoundingClientRect();
      const x = Math.max(POPUP_MARGIN, Math.min(b.left + b.width / 2 - width / 2, window.innerWidth - width - POPUP_MARGIN));
      el.style.setProperty('--sc-pop-x', `${Math.round(x)}px`);
      el.setAttribute('data-sc-anchored', '');
    }
  }

  // Both placements read layout, so DOM changes (constant during playback)
  // are coalesced to one pass per frame. Animation frames run before paint.
  let placeFrame = 0;
  function placePopups() {
    if (placeFrame) return;
    placeFrame = requestAnimationFrame(() => {
      placeFrame = 0;
      placeLegacyPopups();
      placeClassicPopups();
    });
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
    // While the page is loading, the script may still be half written: try
    // again on the next pass instead of giving up.
    const loading = document.readyState === 'loading';
    const text = el.textContent;
    if (!text && loading) return;
    try {
      const current = JSON.parse(text || '{}')?.meta?.current;
      stateRead = true;
      if (current) rememberAuthor(current.songId, current.author);
    } catch (_) {
      if (!loading) stateRead = true;   /* malformed or changed format: no author shown */
    }
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
  // player did. Songsterr's mixer button only carries an icon, so the names
  // are read from the header's print-only line (#header _trackForPrint:
  // instrument, track name), falling back to the page title
  //   "<Song> Tab by <Artist> - <Track name> - <Instrument> | Songsterr ..."
  // (counted from the end, so a " - " in the song name does no harm), and
  // handed to CSS as data attributes on the button.
  // Setting attributes Songsterr's renderer doesn't own leaves its state alone.
  // The favourite / display-mode / editor strip sits over the right end of
  // the bar; its width is published as --sc-classic-strip-w so the button
  // row stops short of it.
  // ---------------------------------------------------------------------------
  const TRACK_ATTRS = ['data-sc-instrument', 'data-sc-track'];

  // Compact levels for when the buttons don't fit on one row (classic.css,
  // classic.compact). The row's items never shrink, so overflow means the
  // last item's right edge passes the row's content edge (its right padding
  // is reserved for the favourite / display-mode / editor strip). scrollWidth
  // can't be used: overflow into that padding doesn't count. Hysteresis: going back a level needs the row
  // to have room for the width it needed at that level, or fewer buttons
  // (e.g. the editor was closed); otherwise it would flip back and forth.
  const CLASSIC_LEVELS = [
    [],
    ['sc-classic-small'],
    ['sc-classic-small', 'sc-classic-tight'],
    ['sc-classic-small', 'sc-classic-tight', 'sc-classic-tighter']
  ];
  const ROW = '#controls [class*="_controlsCard"] > div';
  let classicLevel = 0;
  const levelNeed = [];   // levelNeed[n] = row width needed at level n (when it overflowed)
  const levelItems = [];  // levelItems[n] = item count at that time

  function fitClassicRow(classic) {
    let level = classicLevel;
    const row = classic ? document.querySelector(ROW) : null;
    if (!row) {
      level = 0;
    } else {
      const items = row.childElementCount;
      const limit = row.getBoundingClientRect().right - parseFloat(getComputedStyle(row).paddingRight);
      let right = -Infinity;
      for (const child of row.children) right = Math.max(right, child.getBoundingClientRect().right);
      const overflow = right > limit + 1;
      if (overflow && level < CLASSIC_LEVELS.length - 1) {
        levelNeed[level] = row.clientWidth + (right - limit);
        levelItems[level] = items;
        level += 1;
      } else if (!overflow && level > 0) {
        const prev = level - 1;
        if (items < levelItems[prev] || row.clientWidth >= levelNeed[prev]) level = prev;
      }
    }
    if (level === classicLevel) return;
    classicLevel = level;
    wanted = classesFor(settings);
    syncClasses();
  }

  function trackFromHeader() {
    const parts = document.querySelectorAll('#header [class*="_trackForPrint"] > [class*="_trackForPrintPart"]');
    if (parts.length < 2) return null;
    const instrument = parts[0].textContent.trim();
    const track = parts[1].textContent.trim();
    return instrument ? { instrument, track } : null;
  }

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
    fitClassicRow(classic);
    const mixer = document.getElementById('control-mixer');
    if (mixer) {
      const info = classic ? (trackFromHeader() || trackFromTitle()) : null;
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
  // Keep the player open (Fusion; popup "Stay open").
  // Songsterr folds its player panel back to one row on its own: after any
  // button/link click inside the panel once it was opened by hand, when
  // playback starts, and when Tab/Sheet/Chords changes. Its handle bar loses
  // the _panelHandleBarOpen class the moment that happens (the fold animation
  // only starts on the next frame), so an observer on that class re-opens it
  // straight away by clicking Songsterr's own handle, which is the same
  // toggle the user would click (after a short delay, see reopen()). Folds the user asked for are left alone: a click or touch on the
  // handle, or a drag on the panel (Songsterr lets you drag anywhere on it).
  // The extension never closes the panel and never opens it first; it only
  // keeps it open once the user has opened it.
  // ---------------------------------------------------------------------------
  const HANDLE = '#controls-panel-handle';
  const USER_FOLD_MS = 1000;   // a fold this soon after the user touched the handle/dragged is theirs
  let lastUserFold = 0;
  let dragStart = null;
  let observedBar = null;
  let barObserver = null;
  let barWasOpen = false;

  document.addEventListener('pointerdown', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest(HANDLE)) lastUserFold = Date.now();
    dragStart = target.closest('#controls') ? event.clientY : null;
  }, true);
  document.addEventListener('pointermove', (event) => {
    if (dragStart !== null && event.buttons && Math.abs(event.clientY - dragStart) > 6) lastUserFold = Date.now();
  }, true);
  document.addEventListener('pointerup', () => {
    if (dragStart !== null && Date.now() - lastUserFold < 50) lastUserFold = Date.now();
    dragStart = null;
  }, true);

  function barIsOpen(bar) {
    return /_panelHandleBarOpen/.test(bar.className);
  }

  // Re-open a moment later, not synchronously: on Play, Songsterr folds twice
  // in one go (the click, then its "playback started" effect), and a re-open
  // squeezed in between is folded again before anything is drawn.
  const REOPEN_DELAY_MS = 60;
  let reopenTimer = 0;

  function reopen() {
    reopenTimer = 0;
    const bar = observedBar;
    if (!bar || !bar.isConnected || barIsOpen(bar)) return;
    if (Date.now() - lastUserFold <= USER_FOLD_MS) return;
    const handle = document.querySelector(HANDLE);
    if (handle) handle.click();
  }

  function onBarChange() {
    const open = barIsOpen(observedBar);
    if (barWasOpen && !open && Date.now() - lastUserFold > USER_FOLD_MS && !reopenTimer) {
      reopenTimer = setTimeout(reopen, REOPEN_DELAY_MS);
    }
    barWasOpen = open;
  }

  function syncKeepOpen() {
    const active = settings.enabled && settings.layout === 'fusion' && settings.keepOpen;
    const bar = active ? document.querySelector(`${HANDLE} [class*="_panelHandleBar"]`) : null;
    if (bar === observedBar) return;
    if (barObserver) barObserver.disconnect();
    observedBar = bar;
    if (!bar) return;
    barWasOpen = barIsOpen(bar);
    barObserver = new MutationObserver(onBarChange);
    barObserver.observe(bar, { attributes: true, attributeFilter: ['class'] });
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
      syncVideoToggle();
      syncAuthor();
      syncClassic();
      syncKeepOpen();
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
  new MutationObserver(() => {
    placePopups();
    schedule();
  }).observe(root, {
    attributes: true,
    attributeFilter: ['class', 'data-ready', 'data-plus'],
    childList: true,
    subtree: true
  });
  window.addEventListener('popstate', schedule);
  window.addEventListener('resize', () => {
    placePopups();
    schedule();
  });
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
