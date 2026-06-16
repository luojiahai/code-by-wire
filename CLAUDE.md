# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

- Package manager is **pnpm** (pinned), Node 24. Use `pnpm`, never `npm`.
- After `pnpm install` or any Electron upgrade, run `pnpm rebuild:native` — `better-sqlite3` and `node-pty` are native modules and must be rebuilt against Electron's ABI, or the app crashes on launch.
- `pnpm typecheck` runs two passes: `tsconfig.node.json` (main/preload/shared/tests) and `tsconfig.web.json` (React renderer, JSX). Test-reachable types must live in JSX-free `.ts` so they pass under the node config.
- Before pushing, run `pnpm format` and `pnpm lint` — CI's lint job runs `format:check` then `lint` and fails on either.

## Code style

- `no-unsafe-*` lint rules are intentionally downgraded to warn for `src/main/provider/claude/` — those readers consume `any` from external transcript JSON. Don't "fix" the warnings.

## Commits & PRs

- Conventional Commits (`feat`, `fix`, `chore`, `docs`, `refactor`, `ci`, `build`, `test`), optional scope.
- No `Co-Authored-By` trailer in commits and no footer in PR bodies — match the clean existing history.

## Releasing

The maintainer drives releases in two phases. Run the **`release` skill**
(`.claude/skills/release/SKILL.md`) — it's phase-aware:

1. **"Bump version" (before release).** On a branch: set `package.json` `version`,
   update `CHANGELOG.md`, commit as `build(release): vX.Y.Z`, `pnpm format` +
   `lint`, push, and open the PR. Don't tag.
2. **"Release it" (after the PR merges).** Tag `main` as `vX.Y.Z` and ship. Who
   pushes the tag is environment-aware: **local Claude Code pushes it directly**;
   **on the web/remote sandbox the git proxy 403s any ref outside the session
   branch** (tags included), so hand the maintainer the commands instead. Either
   way, then shepherd CI to a verified draft.

Full mechanics and recovery are in `docs/RELEASING.md`.

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles, each mapped to its default label string. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
