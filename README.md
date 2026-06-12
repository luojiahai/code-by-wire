# code-by-wire

[![CI](https://img.shields.io/github/actions/workflow/status/luojiahai/code-by-wire/ci.yml?style=flat-square&label=CI)](https://github.com/luojiahai/code-by-wire/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/luojiahai/code-by-wire?style=flat-square)](https://github.com/luojiahai/code-by-wire/releases)

**The cockpit for local Claude Code.**

A desktop app that puts every Claude Code session in one place: live state,
transcript, terminal, and the cost and context telemetry the CLI keeps out of
sight. One pane instead of a dozen terminal windows.

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

1. Download the latest `.dmg` from
   [Releases](https://github.com/luojiahai/code-by-wire/releases).
2. Open it and drag code-by-wire to Applications.
3. The build is **unsigned**, so the first launch needs one extra step. Either
   right-click the app and choose **Open**, or clear the quarantine flag:

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
