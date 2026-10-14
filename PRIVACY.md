# Privacy Policy

**Classic Skin - Songsterr Extension**
Last updated: 7 October 2026

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
| Theme | dark / light / auto |
| Density | compact / comfortable |
| Author line | show / hide |
| Nav bar | shown / collapsed |
| Player | full / minimised |

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

To show the "Last edited by <author>" line under a song title, the extension reads the
author's name from song information the Songsterr page has already loaded:

- on first page load, from data embedded in the page;
- while you move between songs, from a copy of the site's own song-information
  responses (`/api/meta/...`). The extension makes **no** request of its own and
  does not change what the site sends or receives.

The author name is only used to display that line on the page. It is not
stored or sent anywhere.

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
