/*
 * Classic Skin: popup
 * Reads/writes chrome.storage.sync. Open Songsterr tabs pick up changes via
 * chrome.storage.onChanged in content.js, so nothing is sent to tabs here
 * except the optional "Check selectors" diagnostic.
 */
(() => {
  'use strict';

  const DEFAULTS = {
    enabled: true,
    layout: 'classic',
    navLayout: 'classic',
    classicBar: 'spread',
    accent: 'auto',          // auto = Classic green, Fusion / Legacy blue (see content.js)
    accentCustom: '#2f9e44',
    theme: 'auto',
    density: 'compact',
    showAuthor: true,
    navCollapsed: false,
    paneMinimized: false,
    videoCollapsed: false,
    keepOpen: true,
    animations: true,
    gradients: true,
    noteFlash: false,
    flashColor: 'orange',
    flashCustom: '#f76707'
  };
  const BOOLEAN_KEYS = new Set(['enabled', 'showAuthor', 'navCollapsed', 'paneMinimized', 'videoCollapsed', 'keepOpen', 'animations', 'gradients', 'noteFlash']);

  const form = document.getElementById('settings');
  document.getElementById('version').textContent = `V${chrome.runtime.getManifest().version}`;
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function applyPopupTheme(theme) {
    const resolved = theme === 'auto' ? (darkQuery.matches ? 'dark' : 'light') : theme;
    document.documentElement.dataset.theme = resolved;
  }

  function effectiveAccent(settings) {
    if (settings.accent && settings.accent !== 'auto') return settings.accent;
    return settings.layout === 'classic' ? 'green' : 'blue';
  }

  function render(settings) {
    for (const [key, value] of Object.entries(settings)) {
      const input = form.querySelector(`input[type="radio"][name="${key}"][value="${String(value)}"]`);
      if (input) input.checked = true;
    }
    // "auto" has no button of its own: show the colour it currently means.
    const accent = effectiveAccent(settings);
    const accentInput = form.querySelector(`input[name="accent"][value="${accent}"]`);
    if (accentInput) accentInput.checked = true;
    const custom = /^#[0-9a-f]{6}$/i.test(String(settings.accentCustom)) ? settings.accentCustom : DEFAULTS.accentCustom;
    form.elements.accentCustom.value = custom;
    document.getElementById('custom-hex').textContent = custom;
    document.getElementById('custom-swatch').style.setProperty('--swatch', custom);
    document.getElementById('custom-row').hidden = accent !== 'custom';
    document.documentElement.dataset.accent = accent;
    const flashCustom = /^#[0-9a-f]{6}$/i.test(String(settings.flashCustom)) ? settings.flashCustom : DEFAULTS.flashCustom;
    form.elements.flashCustom.value = flashCustom;
    document.getElementById('flash-custom-hex').textContent = flashCustom;
    document.getElementById('flash-custom-swatch').style.setProperty('--swatch', flashCustom);
    document.getElementById('flash-theme-swatch').style.setProperty('--swatch',
      { blue: '#3a82e4', green: '#2f9e44', red: '#d64545', custom, off: '#8b8f97' }[accent]);
    document.getElementById('flash-color-row').hidden = !settings.noteFlash;
    document.getElementById('flash-custom-row').hidden = !settings.noteFlash || settings.flashColor !== 'custom';
    document.documentElement.dataset.gradients = String(settings.gradients !== false);
    const base = { green: '#2f9e44', red: '#d64545', custom }[accent];
    if (base) document.documentElement.style.setProperty('--sc-accent-base', base);

    const off = settings.enabled === false;
    for (const input of form.querySelectorAll('input:not([name="enabled"])')) {
      input.disabled = off;
    }
    // Collapsing the nav bar only exists in the Fusion quick menu.
    for (const input of form.querySelectorAll('input[name="navCollapsed"]')) {
      input.disabled = off || settings.navLayout !== 'fusion';
    }
    // Bar buttons style only exists in the Classic layout.
    for (const input of form.querySelectorAll('input[name="classicBar"]')) {
      input.disabled = off || settings.layout !== 'classic';
    }
    // Minimising and Stay open only exist in the Fusion layout.
    for (const input of form.querySelectorAll('input[name="keepOpen"]')) {
      input.disabled = off || settings.layout !== 'fusion';
    }
    for (const input of form.querySelectorAll('input[name="paneMinimized"]')) {
      input.disabled = off || settings.layout !== 'fusion';
    }
    // The floating video panel only exists in Classic and Legacy.
    for (const input of form.querySelectorAll('input[name="videoCollapsed"]')) {
      input.disabled = off || settings.layout === 'fusion';
    }
    applyPopupTheme(settings.theme);
  }

  let current = { ...DEFAULTS };

  chrome.storage.sync.get(DEFAULTS).then((stored) => {
    current = { ...DEFAULTS, ...stored };
    render(current);
  });

  form.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.name) return;
    const value = BOOLEAN_KEYS.has(input.name) ? input.value === 'true' : input.value;
    // Picking a custom colour also switches the accent to Custom.
    if (input.name === 'accentCustom' && current.accent !== 'custom') {
      current = { ...current, accent: 'custom', accentCustom: value };
      render(current);
      chrome.storage.sync.set({ accent: 'custom', accentCustom: value });
      return;
    }
    // Same for the flash colour.
    if (input.name === 'flashCustom' && current.flashColor !== 'custom') {
      current = { ...current, flashColor: 'custom', flashCustom: value };
      render(current);
      chrome.storage.sync.set({ flashColor: 'custom', flashCustom: value });
      return;
    }
    current = { ...current, [input.name]: value };
    render(current);
    chrome.storage.sync.set({ [input.name]: value });
  });

  // While the accent is "auto", the colour it stands for is shown checked, and
  // clicking a checked radio fires no change event. Treat that click as
  // picking the colour, so it stays when the layout changes.
  form.addEventListener('click', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.name !== 'accent') return;
    if (current.accent !== 'auto' || input.value !== effectiveAccent(current)) return;
    current = { ...current, accent: input.value };
    render(current);
    chrome.storage.sync.set({ accent: input.value });
  });

  darkQuery.addEventListener('change', () => applyPopupTheme(current.theme));

  // Reflect changes made elsewhere (e.g. the nav collapse tab on the page).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in DEFAULTS) current[key] = newValue === undefined ? DEFAULTS[key] : newValue;
    }
    render(current);
  });

  // ---------- Setting info (i) ----------
  // One tip per setting, keyed by the row's input name. The icon goes in the
  // row's legend; the tip is one shared element placed under (or above) it.
  const TIPS = {
    enabled: 'Turns the whole reskin on or off. Off brings back Songsterr’s own look at once, no reload needed.',
    gradients: 'On: buttons and title bars have a soft top-to-bottom shine. Off: they are filled with a flat colour. Their bevelled edges stay either way, so buttons still look raised.',
    layout: 'How the player controls are laid out. Fusion: a compact strip docked bottom right. Classic: the older Songsterr player, one full-width bar along the bottom. Legacy: the 2018-era column of icon buttons down the right edge.',
    navLayout: 'Where the site menu (Search, My tabs, Help …) sits. Fusion: docked bottom left, and it can be collapsed. Classic: a bar along the top, each icon above its label. Legacy: the 2018-era sidebar down the left edge.',
    classicBar: 'Classic controls only. Spread: a label under every icon, buttons spaced equally across the bar. Icons: icons only, packed to the left.',
    accent: 'The accent colour of pressed buttons, highlights and the play button. Off: no accent, buttons match the Dark or Light theme. Until you pick one, Classic uses green and the other layouts blue.',
    accentCustom: 'Pick any colour for the accent. Its lighter and darker shades are worked out from it.',
    theme: 'Dark or light controls, menus and panels. Auto follows Songsterr’s own theme setting, so the controls and the tab stay in the same scheme.',
    density: 'Size of the player buttons: Compact is 32px tall, Comfortable 38px.',
    animations: 'On: windows, menus and buttons slide and fade. Off: they open and change instantly. The tab and the playback cursor are not affected.',
    noteFlash: 'Experimental. While the tab plays (Synth or Orig.), each tab number lights up and fades out over the note’s length.',
    flashColor: 'Colour of the note flash. Orange stands out from Songsterr’s blue playback cursor. Theme uses your Color theme.',
    flashCustom: 'Pick any colour for the note flash.',
    showAuthor: 'Shows “Last edited by <name>” under the song title, linking to the tab’s author.',
    navCollapsed: 'Fusion quick menu only. Collapsed tucks the bottom-left menu away. The tab at the bottom left of the page does the same.',
    paneMinimized: 'Fusion controls only. Minimised keeps just the favourite / display mode / editor strip. The chevron at the end of that strip does the same.',
    videoCollapsed: 'Classic and Legacy controls only. On songs with a synced video or audio mix, Collapsed slides that panel out of the way (down in Classic, right in Legacy) and it keeps playing. The tab on the panel’s edge does the same.',
    keepOpen: 'Fusion controls only. Songsterr folds its player panel whenever you click a button in it or press play. On: once you open it, it stays open until you close it with the handle or drag it.'
  };
  const tip = document.getElementById('tip');
  const TIP_GAP = 6;

  function showTip(icon) {
    tip.textContent = icon.dataset.tip;
    tip.hidden = false;
    const r = icon.getBoundingClientRect();
    const below = r.bottom + TIP_GAP;
    const top = below + tip.offsetHeight <= window.innerHeight - TIP_GAP
      ? below : Math.max(TIP_GAP, r.top - TIP_GAP - tip.offsetHeight);
    tip.style.top = `${top}px`;
  }
  function hideTip() {
    tip.hidden = true;
  }

  for (const row of form.querySelectorAll('.row')) {
    const input = row.querySelector('input[name]');
    const legend = row.querySelector('legend');
    const text = input && TIPS[input.name];
    if (!legend || !text) continue;
    const icon = document.createElement('button');
    icon.type = 'button';
    icon.className = 'info';
    icon.textContent = 'i';
    icon.dataset.tip = text;
    icon.setAttribute('aria-label', `About ${legend.textContent.trim()}: ${text}`);
    icon.setAttribute('aria-describedby', 'tip');
    icon.addEventListener('pointerenter', () => showTip(icon));
    icon.addEventListener('pointerleave', hideTip);
    icon.addEventListener('focus', () => showTip(icon));
    icon.addEventListener('blur', hideTip);
    legend.append(icon);
  }
  window.addEventListener('scroll', hideTip, { passive: true });

  // ---------- "More settings below" ----------
  // The popup is capped in height, so the lower rows scroll out of sight.
  // The pill shows while there is more to scroll to.
  const moreBelow = document.getElementById('more-below');
  function syncMoreBelow() {
    const rest = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
    moreBelow.hidden = rest <= 24;
  }
  moreBelow.addEventListener('click', () => {
    window.scrollBy({ top: Math.round(window.innerHeight * 0.6), behavior: 'smooth' });
  });
  window.addEventListener('scroll', syncMoreBelow, { passive: true });
  window.addEventListener('resize', syncMoreBelow);
  new ResizeObserver(syncMoreBelow).observe(document.body);
  syncMoreBelow();

  // ---------- Wipe Cache & Settings ----------
  // Two clicks (or a double-click): the first arms the button for a few
  // seconds, the second clears chrome.storage.sync and sets `welcomed: false`,
  // so open Songsterr tabs go back to the defaults (content.js rewrites its
  // settings mirror from them) and show the welcome card again.
  const wipeBtn = document.getElementById('wipe');
  const wipeStatus = document.getElementById('wipe-status');
  const WIPE_IDLE = wipeStatus.textContent;
  const WIPE_ARM_MS = 4000;
  let wipeArmed = 0;

  function disarmWipe(message) {
    clearTimeout(wipeArmed);
    wipeArmed = 0;
    wipeBtn.classList.remove('armed');
    wipeBtn.textContent = 'Wipe Cache & Settings';
    wipeStatus.textContent = message || WIPE_IDLE;
  }

  wipeBtn.addEventListener('click', async () => {
    if (!wipeArmed) {
      wipeBtn.classList.add('armed');
      wipeBtn.textContent = 'Click again to confirm';
      wipeStatus.textContent = 'This resets everything. It can\u2019t be undone.';
      wipeArmed = setTimeout(() => disarmWipe(), WIPE_ARM_MS);
      return;
    }
    disarmWipe();
    try {
      await chrome.storage.sync.clear();
      await chrome.storage.sync.set({ welcomed: false });
      current = { ...DEFAULTS };
      render(current);
      disarmWipe('Done. Everything is back to default, and the welcome card is back on Songsterr.');
    } catch (_) {
      disarmWipe('Couldn\u2019t wipe the settings. Try again.');
    }
  });

  // ---------- Diagnostics ----------
  const diagBtn = document.getElementById('diagnose');
  const diagStatus = document.getElementById('diag-status');
  const diagResults = document.getElementById('diag-results');

  function el(tag, attrs, text) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function showResults(response) {
    diagResults.replaceChildren();
    const table = el('table');
    const head = el('tr');
    head.append(el('th', {}, 'Selector'), el('th', {}, 'Matches'));
    table.append(head);

    let region = null;
    for (const r of response.results) {
      if (r.region !== region) {
        region = r.region;
        const tr = el('tr', { class: 'region' });
        tr.append(el('td', { colspan: '2' }, `${r.region} (${r.status})`));
        table.append(tr);
      }
      const tr = el('tr', { title: r.sel });
      const cls = r.error ? 'miss' : r.count > 0 ? 'ok' : 'muted';
      tr.append(
        el('td', {}, r.key),
        el('td', { class: `n ${cls}` }, r.error ? 'error' : String(r.count))
      );
      table.append(tr);
    }
    diagResults.append(table);
    diagResults.hidden = false;
  }

  diagBtn.addEventListener('click', async () => {
    diagStatus.textContent = 'Checking…';
    diagResults.hidden = true;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = tab ? await chrome.tabs.sendMessage(tab.id, { type: 'sc:diagnose' }) : null;
      if (!response || !response.ok) throw new Error('no response');
      const found = response.results.filter((r) => r.count > 0).length;
      diagStatus.textContent = `${found}/${response.results.length} found on ${response.path}`;
      showResults(response);
    } catch (_) {
      diagStatus.textContent = 'Open a songsterr.com tab first (reload it if it was open before install).';
    }
  });
})();
