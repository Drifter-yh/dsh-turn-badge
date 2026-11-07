# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Use GitHub's
private vulnerability reporting on this repository
(Security → Report a vulnerability), or contact the maintainer listed in
`package.json`. You can expect an acknowledgement within a few days.

## Scope and threat model

`dsh-turn-badge` is a **browser-only** DeepSeek Harness plugin. It adds no host
services, no HTTP endpoint, no model calls and no timers other than the ones
the browser already runs.

### What it reads

- `ctx.uiSession.sessionStatus` — per-session `{ running, pendingInteraction,
  completionUnread }` facts that the Harness client already maintains.
- The session **title** from the client's session list, so the notification can
  say which task finished.

It does **not** read message bodies, tool output, files, credentials or model
responses.

### What it writes

- A `localStorage` key, `dsh-turn-badge.settings`, holding the six boolean
  switches documented in the README.
- OS notifications through the standard Web Notification API, and a badge via
  the Badging API. Notification bodies contain the session title; they are
  rendered by the operating system and never sent anywhere.

### What it does not do

- No telemetry, analytics, remote calls or dynamic code loading.
- No `eval` / `new Function`, no `innerHTML`, no remote scripts.
- No access to the host process, the filesystem or the network.

### Permissions

The first pointer or key event asks for notification permission once. If the
user denies it, the plugin silently degrades to the badge and title dot. The
badge API needs no permission of its own.

### Trust boundary

The plugin runs in the same renderer as the Harness web client, so it inherits
that page's trust boundary. A compromised Harness page or a malicious profile
plugin is outside this plugin's threat model. The plugin never widens the
attack surface: it is a static client bundle plus an intentionally empty host
entry.

## Supported versions

Only the latest published version is supported. Harness versions outside the
range declared in `package.json` (`engines.dsh`) are untested.
