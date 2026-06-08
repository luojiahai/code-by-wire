# code-by-wire

A dark desktop app that monitors and controls local Claude Code sessions. It surfaces the data Claude Code keeps out of sight in `~/.claude` and keeps many sessions in one place instead of scattered across terminal windows.

Electron + React + TypeScript, dark theme only. See `CONTEXT.md` for the vocabulary and `docs/adr/` for the locked architectural decisions.

## Start here (fresh session or agent)

1. Read `CONTEXT.md` (the glossary) and `docs/adr/` (the three locked decisions: statusLine over hooks, incremental SQLite index, provider-adapter model).
2. Skim `src/prototype/` for the chosen design. Overview variant B won; see `src/prototype/NOTES.md` for the verdict.
3. Grab the lowest-numbered open `ready-for-agent` issue and build it. Issue **#2** (the walking skeleton) is the entry point; everything else hangs off it.
4. The PRD and issues live as GitHub issues. This machine's `gh` defaults to a work host, so always target the repo explicitly:
   ```
   GH_HOST=github.com gh issue view <n> -R luojiahai/code-by-wire-source
   ```
   Full conventions in `docs/agents/issue-tracker.md`.

## Develop

```
pnpm install
pnpm dev      # serves the current UI prototype at http://localhost:5180
```

The code under `src/prototype/` is throwaway. Issues #2 and #10 fold variant B into the real Overview and delete the rest.
