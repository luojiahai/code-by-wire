# Contributing to code-by-wire

This is a personal project, built by the owner and Claude Code. I'm not taking
outside code contributions, and pull requests from non-maintainers will be
closed.

Bug reports and ideas are genuinely welcome, though.

## How to help

The most useful thing you can send is a clear, specific issue:

- **Found a bug?** [Open a bug report.](https://github.com/luojiahai/code-by-wire/issues/new?template=bug_report.yml)
- **Want a feature?** [Open a feature request.](https://github.com/luojiahai/code-by-wire/issues/new?template=feature_request.yml)

## Running it locally

You're welcome to clone and run the app to poke around.

### Prerequisites

- macOS (the app is built mac-first)
- Node 24 (see `.nvmrc`; `nvm use` picks it up)
- pnpm 11 (`corepack enable` or install pnpm directly)
- Claude Code installed locally, so there are sessions to observe

### Setup

```
pnpm install
pnpm rebuild:native   # rebuild better-sqlite3 + node-pty for Electron's ABI
pnpm dev              # launch the app
```

Re-run `pnpm rebuild:native` after any Electron upgrade.

## How the project is organized

This repo is built by Claude Code agents working GitHub issues. The domain
language and locked decisions are documented and worth reading:

- `CONTEXT.md`: the glossary. Use its vocabulary in code and issues.
- `docs/adr/`: the architectural decisions that are settled.
- `docs/agents/`: how issues, triage labels, and domain docs are managed.
- `docs/RELEASING.md`: how to cut a versioned `.dmg` release.
