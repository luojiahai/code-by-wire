# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

- Package manager is **pnpm** (pinned), Node 24. Use `pnpm`, never `npm`.
- `pnpm dev` runs the app (electron-vite). `pnpm test` runs the suite (vitest); tests live in `tests/` mirroring the source tree. There's no DOM/renderer test harness — verify UI by hand.
- After `pnpm install` or any Electron upgrade, run `pnpm rebuild:native` — `better-sqlite3` and `node-pty` are native modules and must be rebuilt against Electron's ABI, or the app crashes on launch.
- `pnpm typecheck` runs two passes: `tsconfig.node.json` (main/preload/shared/tests) and `tsconfig.web.json` (React renderer, JSX). Test-reachable types must live in JSX-free `.ts` so they pass under the node config.
- Before pushing, run `pnpm format` and `pnpm lint` — CI's lint job runs `format:check` then `lint` and fails on either.

## Architecture

Electron app, three processes:

- **main** (`src/main/`) — Node. Reads Claude Code transcripts (`provider/claude/`), analytics in better-sqlite3 (`db/`), pty terminals (`terminal/`), git, settings. Request/response only — no background timers or `fs.watch`; the renderer polls.
- **preload** (`src/preload/`) — contextBridge exposing `window.api` to the renderer.
- **renderer** (`src/renderer/src/`) — React 19 + Tailwind 4 + xterm.

`src/shared/` holds types and constants imported across processes via the `@shared/*` alias. IPC channel names are centralized in `src/shared/ipc.ts` (the `IPC` object); handlers register in `src/main/ipc.ts`. Adding a channel means touching both.

## Code style

- `no-unsafe-*` lint rules are intentionally downgraded to warn repo-wide (in `eslint.config.mjs`) — driven by `src/main/provider/claude/`, whose readers consume `any` from external transcript JSON. Don't "fix" the warnings.

## Commits & PRs

- Conventional Commits (`feat`, `fix`, `chore`, `docs`, `refactor`, `ci`, `build`, `test`), optional scope.
- No `Co-Authored-By` trailer in commits and no footer in PR bodies — match the clean existing history.

## Releasing

Releases run in two phases ("bump version", then "release it"). Run the
**`release` skill** (`.claude/skills/release/SKILL.md`).
