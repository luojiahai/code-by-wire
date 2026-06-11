# code-by-wire

**Control and monitor local coding agents.** A dark macOS desktop app that
watches your local Claude Code sessions, surfaces the data Claude Code keeps out
of sight in `~/.claude`, and keeps many sessions in one place instead of
scattered across terminal windows.

[![CI](https://github.com/luojiahai/code-by-wire/actions/workflows/ci.yml/badge.svg)](https://github.com/luojiahai/code-by-wire/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/luojiahai/code-by-wire)](https://github.com/luojiahai/code-by-wire/releases)

Electron + React + TypeScript, dark theme only. One row per session with its
live state (Working, Waiting, Idle, Ended), and panels for the transcript,
tasks, tokens, cost, and git.

<!-- Add a screenshot at docs/assets/screenshot.png and uncomment:
![code-by-wire](docs/assets/screenshot.png)
-->

## Install

1. Download the latest `.dmg` from
   [Releases](https://github.com/luojiahai/code-by-wire/releases).
2. Open it and drag code-by-wire to Applications.
3. The build is **unsigned**, so the first launch needs one extra step. Either
   right-click the app and choose **Open**, or clear the quarantine flag:

   ```
   xattr -dr com.apple.quarantine /Applications/code-by-wire.app
   ```

## Requirements

- macOS (Apple Silicon or Intel)
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
`pnpm dist` packages a local `.dmg` into `release/`.

## How this is built

code-by-wire is built almost entirely by Claude Code agents working GitHub
issues. The vocabulary and the settled decisions are documented so an agent (or
a human) can pick up cold:

- `CONTEXT.md`: the glossary the product is built around.
- `docs/adr/`: the locked architectural decisions (statusLine over hooks,
  incremental SQLite index, provider-adapter model).
- `docs/agents/`: how issues, triage labels, and domain docs are managed.

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
