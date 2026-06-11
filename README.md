`desktop control · claude code`

<h1><img src="docs/assets/wire-mark.svg" alt="" height="32" align="left" hspace="14">code-by-wire</h1>

**The cockpit for local Claude Code.**

A desktop app that watches your local Claude Code sessions, surfaces the data
they keep out of sight in `~/.claude`, and keeps them in one place instead of
scattered across terminal windows.

[![CI](https://github.com/luojiahai/code-by-wire/actions/workflows/ci.yml/badge.svg)](https://github.com/luojiahai/code-by-wire/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/luojiahai/code-by-wire)](https://github.com/luojiahai/code-by-wire/releases)

<img src="docs/assets/hero.svg" alt="code-by-wire — sessions, live states, and per-session panels" width="100%">

<!-- Replace the hero with a real capture when ready: save the app window as
     docs/assets/screenshot.png and point the src above at it. -->

## Features

<table>
  <tr>
    <td width="33%"><b>Every session, one view</b><br>One row per session, with its live state.</td>
    <td width="33%"><b>States that surface what needs you</b><br>Working, Waiting, Idle, Ended. Waiting is loudest.</td>
    <td width="33%"><b>The full transcript</b><br>Messages, tool calls, and results, reconstructed from <code>~/.claude</code>.</td>
  </tr>
  <tr>
    <td><b>Tokens, cost &amp; context</b><br>The usage Claude Code keeps hidden, plus equivalent API value for subscription accounts.</td>
    <td><b>Tasks, subagents &amp; git</b><br>A session's task list, its subagent tree, and its repo state.</td>
    <td><b>Observe, then adopt</b><br>Read any session you didn't spawn; adopt an ended one to drive it.</td>
  </tr>
</table>

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
