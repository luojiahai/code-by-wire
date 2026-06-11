# Contributing to code-by-wire

Thanks for your interest. This is a small, focused project. The guide below gets
you from clone to a passing build.

## Prerequisites

- macOS (the app is built mac-first)
- Node 22 (see `.nvmrc`; `nvm use` picks it up)
- pnpm 10 (`corepack enable` or install pnpm directly)
- Claude Code installed locally, so there are sessions to observe

## Setup

```
pnpm install
pnpm rebuild:native   # rebuild better-sqlite3 + node-pty for Electron's ABI
pnpm dev              # launch the app
```

Re-run `pnpm rebuild:native` after any Electron upgrade.

## Before you push

```
pnpm typecheck
pnpm test
```

Both must pass. `pnpm test` runs the provider read tests over the redacted
`~/.claude` fixtures in `tests/fixtures/`.

## Commits and PRs

- Follow [Conventional Commits](https://www.conventionalcommits.org/): `feat`,
  `fix`, `refactor`, `style`, `docs`, `build`, `ci`, `test`, with a scope where
  it helps (`feat(rail): ...`).
- Keep PRs focused. Link the issue they close.
- The PR template's checklist is the bar: typecheck green, tests green,
  Conventional Commits.

## How the project is organized

This repo is built by Claude Code agents working GitHub issues. The domain
language and locked decisions are documented and worth reading before you make
changes:

- `CONTEXT.md`: the glossary. Use its vocabulary in code and issues.
- `docs/adr/`: the architectural decisions that are settled.
- `docs/agents/`: how issues, triage labels, and domain docs are managed.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By
participating you agree to uphold it.
