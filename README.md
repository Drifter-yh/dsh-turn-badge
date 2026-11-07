# dsh-turn-badge

[English](README.md) | [简体中文](README.zh-CN.md)

[![CI](https://github.com/Drifter-yh/dsh-turn-badge/actions/workflows/ci.yml/badge.svg)](https://github.com/Drifter-yh/dsh-turn-badge/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![dsh](https://img.shields.io/badge/dsh-0.2.2--rc.1-4D6BFE)](https://github.com/deepseek-ai/deepseek-harness)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that treats a
finished turn the way Codex does: **a native notification, an app-icon badge and a title dot**,
cleared the moment you come back.

> Community plugin. Not affiliated with or maintained by DeepSeek AI.

## The problem

Harness runs long tasks. When you switch to another window, finishing the task changes a dot
inside a sidebar you are not looking at. Nothing reaches the operating system, so there is no
notification, no taskbar/Dock badge and no reason to notice — until you remember to check.

## What it does

A turn is "finished" when its session goes from **running** to **idle**.

- **Native notification** — title + session title, e.g. *Task finished — "Weekly report"*.
  Clicking focuses the app and opens that session when the workspace service is available.
- **App-icon badge** — unread session count on the app icon via the Badging API
  (`setAppBadge`), plus the browser tab badge (`setClientBadge`) where supported.
- **Title dot** — a `● ` prefix on the window/tab title, so there is always a visible fallback.
- **Clear on focus** — returning to the window clears the badge, the title marker and the toast.

It stays quiet when you are already looking at the session that finished, skips subagent
sessions by default, and counts distinct sessions rather than turns.

## Install

The package is a normal DSH client plugin. Pick one:

```bash
# From GitHub (works without npm)
dsh plugin --profile <your-profile> add github:Drifter-yh/dsh-turn-badge

# From npm, once the package is published
dsh plugin --profile <your-profile> add dsh-turn-badge
```

Some builds also expose a plugin registry under **Settings → Plugins**.

From a checkout, the bundled portable installer does the same thing for the current profile:

```bash
node install.mjs          # writes <profile>/plugins/dsh-turn-badge + a file: dependency
node uninstall.mjs        # removes it again
```

**Restart Harness once** afterwards: the host reads the profile at boot.

The first click or keypress asks for notification permission. On macOS, also allow
DeepSeek Harness under **System Settings → Notifications**.

## Configure

Settings live in `localStorage`; change them from the DevTools console and refresh:

```js
localStorage.setItem('dsh-turn-badge.settings', JSON.stringify({
  enabled: true,                       // master switch
  toast: true,                         // OS notification
  badge: true,                         // app-icon / tab badge
  titleDot: true,                      // "● " title fallback
  notifyWhenFocusedOtherSession: true, // notify while focused on a different session
  skipSubagents: true                  // ignore subagent turns
}))
```

| Key | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Master switch. `false` disables the whole plugin. |
| `toast` | `true` | OS notification. |
| `badge` | `true` | Badging API calls (app icon and tab). |
| `titleDot` | `true` | `● ` title marker. |
| `notifyWhenFocusedOtherSession` | `true` | Alert when the app is focused but another session is open. |
| `skipSubagents` | `true` | Do not notify for subagent sessions. |

Reset with `localStorage.removeItem('dsh-turn-badge.settings')`.

Console helpers:

```js
__dshTurnBadge.preview()  // fire one sample notification + badge
__dshTurnBadge.clear()    // clear badge, marker and toasts
```

## How it works

```text
DSH client (browser)                      OS
┌──────────────────────────────┐
│ uiSession.sessionStatus       │  running → idle
│   → running set / main view   │ ───────────────▶  Notification
│   → unread sessions           │ ───────────────▶  Badging API
│   → document.title            │ ───────────────▶  "● " marker
└──────────────────────────────┘
```

- The client half subscribes to `ctx.uiSession.sessionStatus`, the per-session
  `{ running, pendingInteraction, completionUnread }` snapshot the Harness client already
  maintains. It records a baseline at load and acts only on a real **true → false** transition.
- The session title comes from the client's session list; no transcript is read.
- The host half is intentionally empty. It exists so the package becomes an active Loader row,
  which is what makes `dsh-client-modules` publish the client bundle.
- No HTTP endpoint, no model calls, no network traffic.

## Platform support

Everything is standard web API, with no Windows- or macOS-specific code:

| Capability | Windows | macOS |
| --- | --- | --- |
| Native notification | Notification Center | Notification Center |
| App-icon badge | Badging API (installed PWA / capable Chromium carrier) | Badging API (capable Chromium / Safari carrier) |
| Tab badge | Chromium `setClientBadge` | Chromium `setClientBadge` |
| Title dot | every carrier | every carrier |

**Honest limitation:** in the DSH desktop app the taskbar/Dock badge depends on Electron's
support for the Badging API. A page plugin cannot call the Electron main process directly. When
the badge is unsupported, the notification and the title dot still work; in an installed PWA the
badge is at its best.

## Privacy

- No telemetry, analytics or remote requests.
- Reads only session status and session **titles**, never message bodies or tool output.
- The settings key is the only thing written to `localStorage`.
- Notification bodies are rendered locally by the OS.

See [SECURITY.md](SECURITY.md) for the full threat model.

## Compatibility

- Harness `>=0.2.2-rc.1 <0.2.3-0`; verified on `0.2.2-rc.1` with the desktop profile.
- `web` and `desktop` profiles.
- Requires the `uiSession` and `sessions` client services (part of the standard web app).

## Limitations

- **Badge support is environmental** — see the platform table above.
- **The page must be alive.** A desktop window in the tray still notifies; a browser tab frozen
  by the OS may delay it.
- **Failure and success look the same.** Any running → idle transition is reported as finished.
- **Subagents are skipped by default**; enable them with `skipSubagents: false`.
- **The title marker is reapplied** when the shell rewrites `document.title`, so it can flicker
  for a frame during navigation.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No notification | Allow notifications for the app; check Do Not Disturb; try `__dshTurnBadge.preview()` |
| No red dot | The carrier does not implement the Badging API — use an installed PWA or rely on the title dot |
| Nothing at all | Restart Harness; the host reads the profile at boot. Check the browser console for `[dsh-turn-badge]` |
| Notified twice | Two sessions finished; the badge counts distinct sessions, not turns |
| Title dot disappeared | Another plugin overwrote the title; the observer re-adds it on the next change |

## Development

```bash
npm test          # 7 headless tests in a Node vm sandbox
npm run check     # syntax check of both halves
npm run pack:check
```

The client bundle is plain JavaScript registered through `window.__ModuleLoader__.load`; there
is no build step. Releases are created from CI on tag push
(`.github/workflows/release.yml`). npm publishing runs only when the repository has an
`NPM_TOKEN` secret, so a tag can still produce a GitHub Release without one.

## License

MIT — see [LICENSE](LICENSE). Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
