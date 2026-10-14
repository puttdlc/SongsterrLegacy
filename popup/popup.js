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
    layout: 'minimal',
    navLayout: 'minimal',
    classicBar: 'spread',
    accent: 'auto',          // auto = Classic green, Fusion / Legacy blue (see content.js)
    accentCustom: '#2f9e44',
    theme: 'dark',
    density: 'compact',
    showAuthor: true,
    navCollapsed: false,
    paneMinimized: false,
    videoCollapsed: false,
    keepOpen: true,
    animations: true
  };
  const BOOLEAN_KEYS = new Set(['enabled', 'showAuthor', 'navCollapsed', 'paneMinimized', 'videoCollapsed', 'keepOpen', 'animations']);

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
