# code-by-wire

**The cockpit for local Claude Code.**

A desktop app that watches your local Claude Code sessions, surfaces the data
they keep out of sight in `~/.claude`, and keeps them in one place instead of
scattered across terminal windows.

[![CI](https://img.shields.io/github/actions/workflow/status/luojiahai/code-by-wire/ci.yml?style=flat-square&label=CI)](https://github.com/luojiahai/code-by-wire/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/luojiahai/code-by-wire?style=flat-square)](https://github.com/luojiahai/code-by-wire/releases)

![Electron](https://img.shields.io/badge/Electron-2C2E3B?style=flat-square&logo=electron&logoColor=9FEAF9)
![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)

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
