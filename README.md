# Songsterr Classic

A Manifest V3 Chrome extension that reskins songsterr.com with flat, rectangular,
tightly aligned controls and subtle edge lighting (bevels, hairline highlights,
inset shadows). It changes the look only. The site behaves exactly as before.

- No network requests, analytics, remote code, fonts or CDNs.
- Permissions: `storage` only, and the content script runs only on `*://*.songsterr.com/*`.
- Paid/Plus features, paywalls and account checks are not touched.
- The notation renderer's output is never styled.

> **Build status: step 3.** The classic style is now site-wide: player pane,
> nav bar, side panels (Search, My tabs, Help, Account ...), dialogs (mixer,
> settings, feature popups, inbox), menus, switches and segmented controls, plus
> the clickable tab author. Still open: promo tone-down.

## Install

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick this folder (the one that contains `manifest.json`).
4. Open or reload a Songsterr tab, for example a song page under `https://www.songsterr.com/a/wsa/...`.

After editing any file, click the reload icon on the extension card, then
reload the Songsterr tab.

## Using it

Click the toolbar icon to open the settings popup:

| Setting | Options | Notes |
|---|---|---|
| Reskin | On / Off | Off removes every style instantly, no reload. |
| Theme | Dark (default) / Light / Auto | **Auto** follows Songsterr's own theme setting, which keeps the controls and the notation area in the same scheme. |
| Density | Compact (default) / Comfortable | 32px vs 38px control height. |
| Author | Show / Hide | "Tab by <name>" under the song title (see below). |
| Nav bar | Shown / Collapsed | Same as the chevron tab at the bottom-left of the page. |
| Promos | Normal / Toned down | Visual only. Never hides content or unlocks anything. (Takes effect once the promos region lands.) |

Settings live in `chrome.storage.sync` and apply live to every open Songsterr tab.

**Check selectors** in the popup counts how many elements each mapped selector
matches on the current page. Many regions only exist on certain pages or while a
panel is open, so a 0 is not automatically a problem. See below.

## How it works

- All styling is plain CSS, injected at `document_start` (no flash of the old UI).
- Every rule is scoped under `html.sc-enabled`. `content.js` adds that class plus
  `sc-theme-*`, `sc-density-*` and `sc-tone-promos` to `<html>`. Removing the class
  turns the reskin off instantly.
- Themes are CSS custom properties (`--sc-bg`, `--sc-surface`, `--sc-accent`,
  `--sc-highlight`, `--sc-shade` and so on) in `src/styles/tokens.css`. A theme is
  just a variable swap.
- Songsterr is a single-page app, but nothing needs re-applying on navigation
  because the styling is pure CSS keyed off `<html>`. A small `MutationObserver`
  that watches only `<html class>` re-adds our classes if the site ever strips them.
- To pick the right theme on the very first frame, `content.js` mirrors the last
  settings into the page's `localStorage` under `sc-classic:settings`.
  `chrome.storage.sync` stays the source of truth.

## Tab author

Songsterr's current header no longer shows who wrote a tab, but the data is
still in the song metadata the site already downloads (`author.name` /
`author.profileName`). The extension shows it again as "Tab by <name>" under the
title, without making any request of its own:

- **First page load:** read from the page's embedded `<script id="state">`
  (`meta.current.author`).
- **In-app navigation:** that embedded state goes stale, so `src/page-meta.js`
  (a small script running in the page's own JS world) watches the site's own
  `/api/meta/{songId}` responses and reads the author from a clone of the
  response. It never changes the request or what the site receives, and
  forwards only the song id, revision id and author name.

It is shown as "Tab by **name**", where the name links to the author's
Songsterr profile (`/user/<profileName>`, the same URL Songsterr's own revision
list uses). The line is a small element of ours (`#sc-author`) placed in the
header's empty, centred info slot under the title, and is removed again when
the reskin or the Author setting is turned off. Revision URLs
(`…-s84335t4/r93259…`) are supported. Chords pages are skipped because they use
a separate chords revision.

## Fixing after a Songsterr update

Songsterr's class names look like `_8e144G_button`, a 6-character module hash plus a
readable stem. **The hash changes between deploys, so this extension never
uses it.** It relies, in order, on:

1. Stable ids: `#controls`, `#control-play`, `#c-speed`, `#header`, `#default-mixer` …
2. ARIA/state attributes: `aria-pressed`, `disabled`, `data-active`, `role="dialog"`.
3. Readable class stems matched hash-agnostically: `[class*="_controlsCard"]`, `[class*="_textSpeed"]`.

Docking also leans on the site's own CSS variables (`--controls-panel-right`,
`--controls-top-panel-bottom`, `--controls-panel-padding`), and the author feature
leans on the `/api/meta/{songId}` URL shape plus the `author` field. If the
author line disappears, check those first (`src/page-meta.js`, `content.js`).

When something stops looking right:

1. Open a song page, click the extension icon, then **Check selectors**. Any
   `styled` region showing **0** where you can see the element on screen is a
   broken selector. Hover a row to see the selector.
2. In DevTools, inspect the element and find its new id, ARIA attribute or class
   stem (the part after the first `_`).
3. Update the entry in `src/selectors.js`. Each entry has a short note on what it
   targets.
4. Each CSS block is labelled with its region key (for example `toolbar.speedText`).
   Grep the CSS for that key and update the selector there too.
5. Reload the extension and the tab.

A broken selector is always safe. The rules that use it stop applying and
Songsterr's original styling shows through. No rule hides content, so a missed
selector can never make the play button or the tab disappear.

## Regions

### Restyled (so far)

- **Site-wide base layer** (`base.css`): Songsterr's corner-radius and shadow
  variables are flattened everywhere (max 3px, one tight shadow plus a hairline).
  Inside every chrome container (`main[id^="panel-"]`, `[role="dialog"]`,
  `[role="menu"]`, `[role="listbox"]`, toolbars), Songsterr's colour variables
  are remapped to the theme tokens, so panels and popups follow Dark/Light even
  where there are no specific rules. The notation and the song header keep
  Songsterr's own colours.
- **Side panels** (Search, My tabs, Help, Account, New tab …): full height
  from the top edge down to the nav bar, always centred on screen. Compact title, sunken rectangular
  search field, flat hairline-separated rows with hover, the current song shown
  with an accent tint and a left edge bar, and square segmented groups
  (Favorites / Contributions / Playlists).
- **Track list / mixer**: docked bottom-right, compact title strip, flat rows,
  active track = accent tint + 3px left accent bar, solo/mute as a joined pair.
- **Settings, feature/speed popups, help (Ctrl+K), inbox, profile menu**: square
  corners, compact title strips, flat sections; rectangular switches.
- **Nav "plus"/"pro" badge and inbox count**: moved next to the icon so they no
  longer cover the label.

- **Player pane, docked** (`#controls` + `[data-controls-top-panel]`): no longer
  a floating bubble. The pane is pinned flush to the bottom-right corner with
  hairline borders and no gap or big shadow. The favourite / display-mode /
  editor row sits flush on top of it as a title strip with the same segmented
  buttons and a sunken select field. The drag handle is a slim 12px strip.
  Collapsed shows exactly one row, and the Plus lock badges use panel colours
  (same size and position).
- **Bottom nav bar, docked + collapsible** (`[class*="_bottomBarWide"]`, `#tablist`):
  the floating 30px pill becomes a toolbar pinned to the bottom-left corner,
  with icon + label side by side, hairline separators and the current page
  shown with an accent tint and underline. A chevron tab on its left edge
  collapses it off-screen and brings it back. The state is remembered.
  Songsterr's own rules still decide when the bar exists at all (hidden below
  880px wide and on the Plus page).
- **Tab author** under the song title (see "Tab author").
- **Player toolbar buttons** (`#controls`): flat, joined segmented strip; 3px max radius;
  bevel highlight/shade; inverted bevel on press; accent tint + inverted bevel for
  toggled-on buttons (loop, metronome, count-in, solo, mute, speed ≠ 100% …); dimmed
  icons for disabled controls; inset focus ring; the speed "100%" pill becomes an
  inset rectangular readout; the floating 20px "card" becomes a hairline-bordered
  panel with one tight shadow; the drag-handle pill becomes a flat bar.

### Planned (next steps)

- Promo tone-down (`#showroom`, `#promo`, Plus banners). Visual only.
- Logged-in-only surfaces (inbox, profile menu, plan badge) were styled from the
  site source but could not be checked in a logged-out test browser.

### Intentionally left alone

- **Notation** (`#tablature` and everything the renderer draws): not styled.
- **Plus/lock badges** on toolbar buttons: recolored at most, never hidden or moved.
- **Disabled/locked logic**: Songsterr decides what is disabled; we only change how it looks.
- **Song header colours and the logo artwork**: the title/artist keep Songsterr's
  colours (they sit on the notation background); the logo only loses its big
  shadow.
- **Page body font**: unchanged, because the notation may inherit it. The system
  font is applied only inside restyled regions.
- **Editor-only toolbars** (note menus, drum toolbar and so on): out of scope for now.

## Design decisions

- **Docked, not floating.** The player pane and nav bar touch the screen edges
  like classic app toolbars. The nav bar's right edge stops where the player pane
  begins (`100vw - --controls-panel-width`), so the two never overlap.
- **Collapsing the nav slides it fully off-screen** and leaves only a 16px
  chevron tab. Hidden links are also removed from the keyboard tab order.
- **Play button is a rounded square, not a circle.** It keeps the accent fill so
  it stays the obvious primary action, but uses the same 3px radius as everything
  else. When the original/synth audio toggle is present, the two join as one
  segmented control.
- **Toolbar = one segmented strip.** Songsterr's toolbar is a wrapping panel
  (about 360px wide, bottom right), so each row reads as a single strip of joined
  buttons. Play and the mixer button stand apart as their own groups.
- **Control height is 32px (compact) / 38px (comfortable), not 28px.** The
  toolbar icons are 28px sprites. Shrinking the buttons to 28px would force the
  icons to scale to an odd size and blur, so the buttons grew to fit the icons.
- **Speed readout sits beside its icon** (it was stacked) so it fits the shorter row.
- **Dark/Light don't recolor the notation.** Explicit Dark or Light reskins the
  controls only. To make the tab area match, set Songsterr's own theme the same
  way, or use **Auto**, which follows it.
- **Accent:** a muted Songsterr blue (`#3a82e4` dark, `#1b66d2` light), so the
  playback cursor and selections stay recognisable.

## Contrast (WCAG AA)

Checked for both themes: body text on buttons ≥ 11:1, muted text on toolbar ≥ 6.5:1,
selected text on its accent tint ≈ 6:1, white play icon on accent ≥ 3.2:1 (a
non-text graphic, so 3:1 is the requirement), focus ring on toolbar ≥ 4.6:1.

## Files

```
manifest.json
src/
  content.js        settings -> <html> classes, nav collapse tab, author attribute, diagnostics
  page-meta.js      page-world, read-only observer of the site's /api/meta responses (author)
  selectors.js      selector map, the single place to fix after site updates
  styles/
    tokens.css      CSS variables for Dark / Light / Auto + density
    base.css        site-wide: radius/shadow flattening, colour remap, focus
    toolbar.css     player pane, dock, top row   (done)
    tracklist.css   track list / mixer           (done)
    menus.css       side panels, dialogs, menus  (done; promos planned)
    header.css      bottom nav dock + author     (done; logo/title planned)
popup/              settings popup (same bevel/segmented look)
icons/              original 16/32/48/128 icon
```
