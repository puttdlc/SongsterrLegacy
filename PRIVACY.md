# Privacy Policy

**Classic Skin - Songsterr Extension**
Last updated: 28 November 2026

Classic Skin is an unofficial browser extension that restyles the interface of
songsterr.com. It is not affiliated with or endorsed by Songsterr.

## Summary

- The extension does **not** collect, transmit, sell or share any personal data.
- It makes **no network requests**: no analytics, no tracking, no remote code.
- It only runs on `songsterr.com` and only stores its own display settings.

## What the extension stores

The only data the extension saves is its own settings:

| Setting | Values |
|---|---|
| Reskin | on / off |
| Controls and Quick menu layouts | Classic / Legacy / Fusion |
| Classic bar buttons | spread / icons |
| Theme, color theme and custom color | choices you make in the popup |
| Density and tab line thickness | choices you make in the popup |
| Author line, animations, gradients, Stay open | on / off |
| Note flash and its color | on / off, color |
| Nav bar, player and video panel | shown / collapsed |
| Welcome card | whether you have dismissed it |

These are stored in two places:

1. **`chrome.storage.sync`**, the browser's extension storage. If you use
   Chrome Sync, Chrome copies these settings to your other signed-in devices.
   That syncing is handled by your browser and your Google account, not by this
   extension. The extension never sends the settings anywhere itself.
2. **A copy in songsterr.com's local storage**, under the key
   `sc-classic:settings`, so the right theme appears instantly when a page
   loads. It contains the same settings listed above and nothing else. You can
   clear it by clearing site data for songsterr.com.

No account details, browsing history, song choices, page content or other
personal information is stored.

## What the extension reads

All of this is read from the Songsterr page already open in your browser, used
there, and never stored or sent anywhere:

- **The tab author**, for the "Last edited by <author>" line: from data
  embedded in the page on first load, and from the page's in-memory data while
  you move between songs.
- **The loaded tab and playback position**, for the optional note flash (beta,
  off by default): which notes are playing and where they are drawn.
- **The track and instrument names**, for the track selector in the Classic
  layout.

The extension makes **no** request of its own, does not watch the site's
requests, and does not change the site's data.

## Permissions

| Permission | Why it is needed |
|---|---|
| `storage` | To save the settings listed above. |
| Runs on `*://*.songsterr.com/*` | The extension only restyles songsterr.com, so its styles and scripts run on that site and nowhere else. |

The extension does not request access to tabs, browsing history, cookies,
downloads or any other website.

## Third parties

The extension does not use any third-party services, libraries loaded from the
internet, fonts from external servers, or analytics. All code is included in
the extension package and is open source:
https://github.com/puttdlc/SongsterrLegacy

Songsterr's own website has its own privacy policy, which applies to your use of
songsterr.com. This extension does not change what Songsterr collects.

## Changes

If this policy changes, the updated version will be published in this file with
a new "Last updated" date.

## Contact

Questions or concerns: open an issue at
https://github.com/puttdlc/SongsterrLegacy/issues
