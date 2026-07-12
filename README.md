# <img src="docs/assets/logo.svg" alt="" height="64" align="center"> Code-by-wire

English | [简体中文](README.zh-CN.md)

[![CI](https://img.shields.io/github/actions/workflow/status/luojiahai/code-by-wire/ci.yml?style=flat-square&label=CI)](https://github.com/luojiahai/code-by-wire/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/luojiahai/code-by-wire?style=flat-square)](https://github.com/luojiahai/code-by-wire/releases)
[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-db61a2?style=flat-square&logo=github&logoColor=white)](https://github.com/sponsors/luojiahai)

[![Buy Me A Coffee](https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=luojiahai&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff)](https://buymeacoffee.com/luojiahai)

**[Website](https://luojiahai.github.io/code-by-wire/)** ·
[Docs](https://luojiahai.github.io/code-by-wire/docs/) ·
[Blog](https://luojiahai.github.io/code-by-wire/blog/) ·
[Changelog](https://luojiahai.github.io/code-by-wire/changelog/)

Claude Code writes a rich trail to the `.claude` directory as it works: every
turn, every token, every tool call, the running cost, the context window. The
CLI shows you almost none of it.

Code-by-wire reads that trail and turns it into one live dashboard — every
session on your machine, with live state, the full transcript, an embedded
terminal to drive or take over, and the telemetry the terminal hides.

![Code-by-wire: a live Claude Code session with the session rail, transcript, and telemetry panels](docs/assets/cbw-screenshot.png)

## Features

Nothing to set up. Open the app and every session already running on your
machine is there.

- **Every session in one rail.** Grouped by project, searchable, each row
  flagging its live state — working, waiting, idle, or ended.
- **Drive, fork, or just watch.** Spawn a session in an embedded terminal,
  fork a live one, adopt one you started elsewhere, or observe it read-only.
- **The full transcript.** Every message, tool call, and result,
  reconstructed from disk and rendered cleanly.
- **The telemetry the CLI hides.** Context pressure, spend, token throughput,
  duty cycle, git, tasks, subagents, and background shells — live, per session.
- **The whole story.** A cross-session Stats view with a year-long
  contributions calendar and exact, never-estimated totals.
- **Your rate limits in view.** Your account's rate-limit windows, read
  straight from disk, with live reset countdowns.

## Download

| Platform              | File                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| macOS · Apple Silicon | [`Code-by-wire-arm64.dmg`](https://github.com/luojiahai/code-by-wire/releases/latest/download/Code-by-wire-arm64.dmg)             |
| macOS · Intel         | [`Code-by-wire-x64.dmg`](https://github.com/luojiahai/code-by-wire/releases/latest/download/Code-by-wire-x64.dmg)                 |
| Windows · x64         | [`Code-by-wire-Setup-x64.exe`](https://github.com/luojiahai/code-by-wire/releases/latest/download/Code-by-wire-Setup-x64.exe)     |
| Windows · ARM64       | [`Code-by-wire-Setup-arm64.exe`](https://github.com/luojiahai/code-by-wire/releases/latest/download/Code-by-wire-Setup-arm64.exe) |

One click starts the download — always the latest release. You'll need
[Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed
locally, so there are sessions to observe and control.

On macOS, open the `.dmg` and drag Code-by-wire to Applications — the app is
signed and notarized by Apple, so it opens straight away. On Windows, run the
`.exe`; it's unsigned for now, so if SmartScreen warns, click
**More info → Run anyway**.

Once installed, the app checks for new releases on launch and updates from
Settings → About.

## Build from source

```
pnpm install
pnpm rebuild:native   # rebuild better-sqlite3 + node-pty for Electron's ABI
pnpm dist             # macOS: writes the .dmg to release/
pnpm dist:win         # Windows: writes the .exe to release/
```

A locally built app is unsigned: on macOS the first launch may need a
right-click → **Open**, or clearing the quarantine flag with
`xattr -dr com.apple.quarantine /Applications/Code-by-wire.app`; on Windows,
SmartScreen may warn — click **More info → Run anyway**.

## Develop

```
pnpm install
pnpm rebuild:native   # rebuild better-sqlite3 + node-pty for Electron's ABI
pnpm dev              # launch the app
```

`pnpm test` runs the provider read tests over the redacted `.claude` fixtures
in `tests/fixtures/`. `pnpm typecheck` checks the main and renderer projects.

This is a personal project and isn't taking outside code, but bug reports and
ideas are welcome. [Open an issue](https://github.com/luojiahai/code-by-wire/issues/new/choose),
or see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
