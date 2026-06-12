# Code-by-wire (CBW)

English | [简体中文](README.zh-CN.md)

[![CI](https://img.shields.io/github/actions/workflow/status/luojiahai/code-by-wire/ci.yml?style=flat-square&label=CI)](https://github.com/luojiahai/code-by-wire/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/luojiahai/code-by-wire?style=flat-square)](https://github.com/luojiahai/code-by-wire/releases)
[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-db61a2?style=flat-square&logo=github&logoColor=white)](https://github.com/sponsors/luojiahai)

**The cockpit for local agentic coding tools (e.g., Claude Code).**

Code-by-wire is a desktop app that puts every agentic coding session in one place: live state,
transcript, terminal, and the cost and context telemetry the CLI keeps out of
sight. One pane instead of a dozen terminal windows.

[![Download for macOS (Apple Silicon)](https://img.shields.io/badge/Download%20for%20macOS%20%28Apple%20Silicon%29-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/luojiahai/code-by-wire/releases/latest)

## The name

Fly-by-wire didn't take the plane away from the pilot. It put a computer
between the stick and the control surfaces, so the pilot commands intent and the
machine handles execution. The pilot still flies, just more capable and more
precise.

Code-by-wire is that idea for software. You command intent, the agent executes,
and you stay pilot in command: live state, the full transcript, and the controls
to take over whenever you want.

## Preview

![code-by-wire](docs/assets/preview.png)

## Features

- **Every session, one view.** One row per session, with its live state.
- **States that surface what needs you.** Working, Waiting, Idle, Ended. Waiting is loudest.
- **The full transcript.** Messages, tool calls, and results, reconstructed from `~/.claude`.
- **Tokens, cost & context.** The usage Claude Code keeps hidden, plus equivalent API value for subscription accounts.
- **Tasks, subagents & git.** A session's task list, its subagent tree, and its repo state.
- **Observe, then adopt.** Read any session you didn't spawn; adopt an ended one to drive it.

## Install

Download the prebuilt app, or build it yourself.

### Download

1. [Download the latest `.dmg`](https://github.com/luojiahai/code-by-wire/releases/latest).
2. Open it and drag code-by-wire to Applications.
3. Launch it. The app is signed and notarized by Apple, so it opens straight
   away, no Gatekeeper warning and no quarantine workaround.

### Build from source

Build an unsigned `.dmg` locally instead:

```
pnpm install
pnpm rebuild:native   # rebuild better-sqlite3 + node-pty for Electron's ABI
pnpm dist             # writes the .dmg to release/
```

Open the `.dmg` from `release/` and drag code-by-wire to Applications. Because
it's unsigned, the first launch may need a right-click → **Open**, or clearing
the quarantine flag:

```
xattr -dr com.apple.quarantine /Applications/code-by-wire.app
```

## Requirements

- macOS (Apple Silicon)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed
  locally, so there are sessions to observe and control

## Develop

```
pnpm install
pnpm rebuild:native   # rebuild better-sqlite3 + node-pty for Electron's ABI
pnpm dev              # launch the app
```

`pnpm test` runs the provider read tests over the redacted `~/.claude` fixtures
in `tests/fixtures/`. `pnpm typecheck` checks the main and renderer projects.

See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

## Project layout

```
src/
  main/       Electron main process: providers, db, git, terminal, sync
  preload/    the IPC bridge
  renderer/   React UI (session list, workspace panels, terminal)
  shared/     types and helpers shared across processes
```

## License

[MIT](LICENSE)
