/*
 * Classic Skin: selector map
 * ================================
 * The single reference for every part of songsterr.com this extension styles.
 * The CSS files use these same selectors; each CSS block names its region key
 * (for example "toolbar.buttons"), so when Songsterr ships an update, fix the
 * selector here, then grep the CSS for the region key and fix it there too.
 *
 * How Songsterr names things (as of the 2026-10 build):
 *   - Stable ids:      #controls, #control-play, #c-speed, #header, #tablist ...
 *   - State attrs:     aria-pressed, aria-haspopup, disabled, data-active
 *   - CSS modules:     class="<6-char hash>_<readableStem>", e.g. "_8e144G_button".
 *                      The hash changes when the component changes; the stem
 *                      ("_button", "_textSpeed") is usually stable. We match
 *                      stems with [class*="_stem"] and never use the hash.
 *
 * Tiers (most to least stable): id > aria/role/data > stem > hash.
 * Non-DOM dependency: page-meta.js matches the site's /api/meta/{songId} URLs.
 * No selector currently relies on a full hashed class name.
 *
 * Nothing in here hides content. If a selector stops matching, the rules that
 * use it simply stop applying and Songsterr's own styling shows through.
 *
 * Status: "styled" means CSS for the region ships now; "planned" means it was
 * mapped from the site source but its CSS has not landed yet.
 */
(() => {
  'use strict';

  const SC_SELECTORS = {
    toolbar: {
      status: 'styled',
      pane:      { sel: '#controls', tier: 'id', note: 'Player pane (<aside>). Holds the drag handle, card and button row. Fixed bottom-right on desktop.' },
      card:      { sel: '#controls [class*="_controlsCard"]', tier: 'stem', note: 'Card wrapper. Its ::before draws the 20px-radius floating bubble when the panel floats.' },
      row:       { sel: '#controls div:has(> [id^="c-"])', tier: 'id', note: 'Wrapping flex row that directly contains the c-* item wrappers.' },
      items:     { sel: '#controls [id^="c-"]', tier: 'id', note: 'Item wrappers: c-loop, c-play, c-speed, c-countin, c-metronome, c-solo, c-mute, c-settings, c-print, c-fretboard ...' },
      buttons:   { sel: '#controls button[id^="control-"]', tier: 'id', note: 'Every toolbar button (id = control-<icon>). States: aria-pressed="true", :disabled.' },
      playGroup: { sel: '#item-play-button', tier: 'id', note: 'Container joining the play button and the audio-source toggle.' },
      play:      { sel: '#control-play', tier: 'id', note: 'Main play/pause button. aria-pressed="true" while playing.' },
      source:    { sel: '#control-source', tier: 'id', note: 'Original/Synth audio-source toggle next to play (only on some songs).' },
      mixer:     { sel: '#control-mixer', tier: 'id', note: 'Opens the track list (mixer). Shows the instrument icon or a track counter.' },
      speedText: { sel: '#control-speed [class*="_textSpeed"]', tier: 'stem', note: 'The "100%" label inside the speed button (was a pill).' },
      metronomeSettings: { sel: '#metronome-settings', tier: 'id', note: 'Small "..." tab that appears above the metronome button when it is on.' },
      handle:    { sel: '#controls-panel-handle', tier: 'id', note: 'Drag handle bar above the row (collapse/expand).' },
      topPanel:  { sel: '[data-controls-top-panel]', tier: 'data', note: 'Row above the pane: favourite, display-mode select, editor. Positioned via --controls-top-panel-bottom.' },
      topItems:  { sel: '[data-controls-top-panel] [class*="_controlsTopItem"]', tier: 'stem', note: 'Item slots inside the top row.' },
      favorite:  { sel: '#favorite-toggle', tier: 'id', note: 'Favourite star. Chosen state = class stem _toggleChosen.' },
      displayMode: { sel: '#display-mode-button', tier: 'id', note: 'Tab / Sheet / Chords select (role="combobox").' },
      editor:    { sel: '#control-editor', tier: 'id', note: 'Tab editor toggle (pencil). aria-pressed when on.' },
      minimize:  { sel: '#sc-pane-toggle', tier: 'id', note: 'Ours: minimise toggle appended to the top strip; hides the pane, keeps the strip.' }
    },

    nav: {
      status: 'styled',
      bar:    { sel: '[class*="_bottomBarWide"]', tier: 'stem', note: 'Fixed bottom nav container (was a floating 30px pill). Site hides it <880px, for data-plus="true", and until data-ready="true".' },
      list:   { sel: '#tablist', tier: 'id', note: 'The <nav> inside the bar (flex row-reverse).' },
      items:  { sel: '#tablist a[id^="menu-"]', tier: 'id', note: 'Entries: menu-search, menu-favorites, menu-newtab, menu-help, menu-signin, menu-plus ... aria-active="true" = current page.' },
      toggle: { sel: '#sc-nav-toggle', tier: 'id', note: "Ours: collapse tab appended to <body> by content.js." }
    },

    tracklist: {
      status: 'styled',
      dialog:   { sel: '#default-mixer', tier: 'id', note: 'Mixer dialog (role="dialog"), lazy-loaded when the track list opens.' },
      scroller: { sel: '#mixer-items-scroller', tier: 'id', note: 'Scrollable track list.' },
      rows:     { sel: '[id^="mixer-item-"]', tier: 'id', note: 'One row per track; data-active="true" on the current track.' },
      rowLink:  { sel: '[id^="mixer-item-"] a[aria-current], [id^="mixer-item-"] a', tier: 'aria', note: 'Clickable track name area.' },
      soloMute: { sel: '[id^="mixer-item-"] button[aria-pressed]', tier: 'aria', note: 'Per-track solo/mute buttons (pill-shaped originally).' },
      volume:   { sel: '#mixer-sound-value', tier: 'id', note: 'Master volume row in the mixer header.' }
    },

    header: {
      status: 'planned (author line styled)',
      header:  { sel: '#header', tier: 'id', note: 'Song title header above the tab.' },
      author:  { sel: '#header #sc-author', tier: 'id', note: 'Ours: "Tab by <name>" link to /user/<profileName>, appended by content.js into the header\'s empty [class*=_info] slot (or #header).' },
      infoSlot:{ sel: '#header > [class*="_wrap"] > [class*="_info"]', tier: 'stem', note: 'Empty centred slot under the title where the author line goes.' },
      planBadge: { sel: '#tablist [class*="_planBadge"]', tier: 'stem', note: '"plus"/"pro" badge on the account nav item (logged in).' },
      title:   { sel: '#song-ttl', tier: 'id', note: 'Song title text.' },
      artist:  { sel: '#song-artist', tier: 'id', note: 'Artist link.' },
      logo:    { sel: '#logo', tier: 'id', note: 'Songsterr logo link (top-left).' },
      state:   { sel: 'script#state[type="application/json"]', tier: 'id', note: 'Embedded page state; author at meta.current.author. Read-only.' }
    },

    chrome: {
      status: 'styled (colour remap, base.css)',
      panels:  { sel: 'main[id^="panel-"]', tier: 'id', note: 'Side panels: panel-search, panel-favorites, panel-help, panel-account ...' },
      dialogs: { sel: '[role="dialog"]', tier: 'aria', note: 'Mixer, settings, speed/feature popups, help popup, inbox.' },
      menus:   { sel: '[role="menu"]', tier: 'aria', note: 'Profile menu.' },
      lists:   { sel: '[role="listbox"]', tier: 'aria', note: 'Dropdown option lists.' }
    },

    panels: {
      status: 'styled',
      main:     { sel: 'main[id^="panel-"][class*="_mainPanel"]', tier: 'id', note: 'Full height down to the nav bar, always centred horizontally.' },
      title:    { sel: 'main[id^="panel-"] h1', tier: 'id', note: '"Search tabs" / "My tabs" heading.' },
      field:    { sel: 'main[id^="panel-"] input[placeholder]', tier: 'id', note: 'Search / filter text field.' },
      rows:     { sel: 'main[id^="panel-"] a[aria-selected]', tier: 'aria', note: 'Song rows; aria-selected="true" = current song.' },
      segments: { sel: '[class*="_group"]:has(> [class*="_groupItem"])', tier: 'stem', note: 'Segmented groups (Favorites / Contributions / Playlists).' }
    },

    menus: {
      status: 'styled',
      settings: { sel: '#settings-popup', tier: 'id', note: 'Settings dialog, docked bottom-right.' },
      header:   { sel: '[role="dialog"] [class*="_popupHeader"]', tier: 'stem', note: 'Title bars of Mixer / Settings.' },
      inbox:    { sel: '#inbox-popup', tier: 'id', note: 'Inbox popup (logged in).' },
      profile:  { sel: '#profile-popup', tier: 'id', note: 'Account / Sign out menu (logged in).' },
      switches: { sel: '[class*="_switchSlider"]', tier: 'stem', note: 'Toggle switches (role="switch" inputs).' },
      popupsLayer: { sel: '#tab-controls [class*="_popupsLayer"]', tier: 'stem', note: 'Layer holding the toolbar popovers (speed, metronome, settings).' }
    },

    promos: {
      status: 'planned',
      showroom: { sel: '#showroom', tier: 'id', note: 'Ad/banner slot above the tab. Tone-down only, never hidden.' },
      promo:    { sel: '#promo', tier: 'id', note: 'Contextual promo popup (app store / offers).' }
    },

    // Never styled: listed so nobody adds rules here by accident.
    notation: {
      status: 'off-limits',
      apptab:    { sel: '#apptab', tier: 'id', note: 'Tab page section. Only its background may be adjusted.' },
      tablature: { sel: '#tablature', tier: 'id', note: 'Notation renderer output. Do not style.' }
    }
  };

  /** Count matches for every mapped selector on the current page. */
  function scDiagnose() {
    const out = [];
    for (const [region, entries] of Object.entries(SC_SELECTORS)) {
      for (const [key, entry] of Object.entries(entries)) {
        if (key === 'status') continue;
        let count = 0;
        let error = null;
        try {
          count = document.querySelectorAll(entry.sel).length;
        } catch (e) {
          error = String(e && e.message || e);
        }
        out.push({ region, key, sel: entry.sel, tier: entry.tier, status: entries.status, count, error });
      }
    }
    return out;
  }

  globalThis.SC_SELECTORS = SC_SELECTORS;
  globalThis.scDiagnose = scDiagnose;
})();
