# pwcrowbar

A scrappy Chrome extension (Manifest V3) that pries open paywalls and tracking by blocking network resources and redirects with user-defined regex rules.

It's a homemade tool. Built for tinkering and personal use. No telemetry, no remote config, no fancy UI — just regex and Chrome's `declarativeNetRequest` doing the heavy lifting.

## What it does

- **Resource blocking** — match `domain regex` + `file regex` and the request never leaves the browser. Useful for killing paywall scripts, tracking pixels, analytics beacons, etc.
- **Redirect blocking** — match a destination URL regex and any navigation to it is cancelled. Covers both HTTP 3xx redirects (via DNR) and JavaScript redirects (via an injected script that intercepts `location.*`, `history.pushState/replaceState`, `window.open`, etc.).

All rules live in `chrome.storage` and are pushed to `declarativeNetRequest` as dynamic rules.

## Install (unpacked)

1. Clone the repo.
2. Open `chrome://extensions/`.
3. Toggle **Developer mode** (top right).
4. Click **Load unpacked** and pick the project root.
5. Pin the extension if you want the popup handy.

## Usage

Open the extension popup → **Open full view**. Or `chrome://extensions/` → `pwcrowbar` → **Details** → **Extension options**.

### Resource Blocking tab

- **Domain regex** — matched against the request hostname. Example: `(^|\.)example\.com$`.
- **File regex list** — one per line, matched against path + query. Example: `.*/tracker\.js(\?.*)?$`.

The extension combines both into a single regex applied to the full URL.

### Redirect Blocking tab

- **Destination regex** — matched against the full URL of any navigation attempt. Example: `.*\.example\.com/subscribe.*`.

### Tips

- Chrome uses the RE2 engine. **No lookbehinds, no backreferences.** Invalid patterns are skipped and logged.
- Test your patterns externally before saving (an online RE2 tester or `re2test`).
- Console output for the service worker: `chrome://extensions/` → **service worker** → **Inspect**.
- Console output for the injected script: regular page DevTools → console (look for `[pwcrowbar]` prefix).

## Project layout

```
manifest.json          MV3 manifest
src/background.js      Service worker — builds DNR rules from storage
src/content.js         Content script (ISOLATED) — loads rules, injects MAIN-world script
src/injected.js        Runs in MAIN — intercepts JS navigation APIs
src/options.html/.js   Rule management UI
src/popup.html/.js     Toolbar popup
src/options.css        Styles
```

## Status

Personal-use experiment. Expect rough edges. Open issues if you find them — patches welcome.

## License

MIT. Do whatever, just don't blame me when it breaks.
