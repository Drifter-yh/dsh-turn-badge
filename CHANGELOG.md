# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-07

### Added

- Detect a finished turn from `uiSession.sessionStatus` (running → idle).
- Native system notification with the session title; clicking focuses the app
  and opens the session when `uiWorkspace.openSession` is available.
- App-icon badge through the Badging API (`setAppBadge` / `setClientBadge`),
  with a `● ` title marker as the fallback.
- Clear badge, title marker and toast when the window regains focus.
- Ignore the session you are already looking at; skip subagent sessions by
  default; aggregate unread count per session.
- Six `localStorage` switches, including a master switch.
- Console helpers `__dshTurnBadge.preview()` and `__dshTurnBadge.clear()`.
- Portable `install.mjs` / `uninstall.mjs` for profile installs.
- Seven headless tests covering completion detection, focus suppression,
  subagent filtering, disposal, disabled state and denied notification
  permission.

[0.1.0]: https://github.com/Drifter-yh/dsh-turn-badge/releases/tag/v0.1.0
