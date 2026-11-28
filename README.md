# Classic Skin - Songsterr Extension

Unofficial. Not affiliated with or endorsed by Songsterr.

## [Get it for Chrome](https://chromewebstore.google.com/detail/hibbioblpmhnofcnidgmcndehhpaocfp?utm_source=item-share-cb)

## [Get it for Firefox](https://addons.mozilla.org/en-US/firefox/addon/classic-skin-for-songsterr/)

A Manifest V3 Chrome extension that reskins songsterr.com with flat, rectangular,
tightly aligned controls and subtle edge lighting (bevels, hairline highlights,
inset shadows). It also shows who last edited a tab, can keep the player
panel open, and has an optional note flash (beta) during playback.

- No network requests, analytics, remote code, fonts or CDNs.
- Permissions: `storage` only, and the content script runs only on `*://*.songsterr.com/*`.
- Paid/Plus features, paywalls and account checks are not touched.
- The notation renderer's output is never styled.
- Privacy: no data collected or sent. See [PRIVACY.md](PRIVACY.md).

## Install

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick this folder (the one that contains `manifest.json`).
4. Open or reload a Songsterr tab, for example a song page under `https://www.songsterr.com/a/wsa/...`.

After editing any file, click the reload icon on the extension card, then
reload the Songsterr tab.

## License

Copyright (c) 2026 puttdlc. Licensed under the GNU General Public License v3.0; see `LICENSE`.
