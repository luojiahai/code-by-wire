# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

- Package manager is **pnpm** (pinned), Node 24. Use `pnpm`, never `npm`.
- `pnpm dev` runs the app (electron-vite). `pnpm test` runs the suite (vitest); tests live in `tests/` mirroring the source tree. `tests/renderer/**` and `tests/xterm/**` run under jsdom (renderer logic only); there's no component-render harness, so verify actual UI by hand. Vitest only picks up `tests/**/*.test.ts` — no `.tsx` tests.
- CI runs `pnpm test` on both `ubuntu-latest` and `windows-latest` (`.github/workflows/ci.yml`) — terminal/pty and path-handling code must work on both, not just macOS where local dev happens.
- After `pnpm install` or any Electron upgrade, run `pnpm rebuild:native` — `better-sqlite3` and `node-pty` are native modules and must be rebuilt against Electron's ABI, or the app crashes on launch.
- `pnpm typecheck` runs two passes: `tsconfig.node.json` (main/preload/shared/tests) and `tsconfig.web.json` (React renderer, JSX). Test-reachable types must live in JSX-free `.ts` so they pass under the node config.
- Before pushing, run `pnpm format` and `pnpm lint` — CI's lint job runs `format:check` then `lint` and fails on either.
- `scripts/make-icon.mjs` (`pnpm icon`) string-replaces exact lines from `build/icon.svg` — editing the SVG can silently break macOS icon generation; check the script's `.replace()` targets after any SVG change.

## Website

`website/` (marketing site, Astro + Vercel) is a separate project sharing this
repo — it has its own `pnpm-workspace.yaml`, isolating its install and
lockfile from the root workspace. Run its commands from inside `website/`:
`pnpm install`, `pnpm dev`, `pnpm run check` (typecheck), `pnpm test`.

## Architecture

Electron app, three processes plus a utility process:

- **main** (`src/main/`) — Node. Reads Claude Code and Codex transcripts (`provider/claude/`, `provider/codex/`), analytics in better-sqlite3 (`db/`), pty terminals (`terminal/`), git, settings. Request/response only — no background timers or `fs.watch`; the renderer polls.
- **parse worker** (`src/main/parse-worker/`, its own bundle entry → `out/main/parse-worker.js`) — a `utilityProcess` main forks lazily so every poll-driven fs read (summarize, discovery, transcript/metrics/shells/monitors/tasks reads, the reconcile sweeps) runs off the main thread. It hosts the same `ClaudeReader` main falls back to; transcript docs return as one JSON string (`TranscriptReadWire`) that main relays and the preload parses. Still request/response (rides renderer polls); on worker fault each read degrades to the same code in-process. Main-process state (managed registry, model picks) never moves in — it rides the request or adorns the response.
- **preload** (`src/preload/`) — contextBridge exposing `window.api` to the renderer.
- **renderer** (`src/renderer/src/`) — React 19 + Tailwind 4 + xterm.

`src/shared/` holds types and constants imported across processes via the `@shared/*` alias. IPC channel names are centralized in `src/shared/ipc.ts` (the `IPC` object); handlers register in `src/main/ipc.ts`. Adding a channel means touching both.

This app supports multiple coding agents (Claude Code, Codex). `src/shared/agents.ts` is the
source of truth: the `AGENTS` registry and its `AgentCapabilities` flags. Renderer surfaces gate
on those flags, never on agent id — so enabling a surface for an agent is a registry edit plus a
provider implementation, not new surface wiring.

## Code style

- `no-unsafe-*` lint rules are intentionally downgraded to warn repo-wide (in `eslint.config.mjs`) — driven by `src/main/provider/claude/`, whose readers consume `any` from external transcript JSON. Don't "fix" the warnings.

## Commits & PRs

- Conventional Commits (`feat`, `fix`, `chore`, `docs`, `refactor`, `ci`, `build`, `test`), optional scope.
- No `Co-Authored-By` trailer in commits and no footer in PR bodies — match the clean existing history.

## Releasing

Releases run in two phases ("bump version", then "release it"). Run the
**`release` skill** (`.claude/skills/release/SKILL.md`).
