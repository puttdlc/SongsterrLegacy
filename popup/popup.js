/*
 * Songsterr Classic: popup
 * Reads/writes chrome.storage.sync. Open Songsterr tabs pick up changes via
 * chrome.storage.onChanged in content.js, so nothing is sent to tabs here
 * except the optional "Check selectors" diagnostic.
 */
(() => {
  'use strict';

  const DEFAULTS = {
    enabled: true,
    theme: 'dark',
    density: 'compact',
    toneDownPromos: false
  };
  const BOOLEAN_KEYS = new Set(['enabled', 'toneDownPromos']);

  const form = document.getElementById('settings');
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function applyPopupTheme(theme) {
    const resolved = theme === 'auto' ? (darkQuery.matches ? 'dark' : 'light') : theme;
    document.documentElement.dataset.theme = resolved;
  }

  function render(settings) {
    for (const [key, value] of Object.entries(settings)) {
      const input = form.querySelector(`input[name="${key}"][value="${String(value)}"]`);
      if (input) input.checked = true;
    }
    const off = settings.enabled === false;
    for (const input of form.querySelectorAll('input:not([name="enabled"])')) {
      input.disabled = off;
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
    current = { ...current, [input.name]: value };
    render(current);
    chrome.storage.sync.set({ [input.name]: value });
  });

  darkQuery.addEventListener('change', () => applyPopupTheme(current.theme));

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
