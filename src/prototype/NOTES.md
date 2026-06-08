# Overview UI prototype

**Question:** What should the code-by-wire Overview (the front door) look like? Three
radically different layouts, switchable via `?variant=` and the floating bottom bar
(or ← / → keys). Click any session to drill into the Workspace.

Throwaway. When a layout wins, fold it into the real Overview and delete the losers,
the switcher, and (eventually) this whole `src/prototype/` folder. Mock data only, no
backend, no persistence.

## Variants

- **A — Fleet grid** (`?variant=A`): hero strip (account health, live counts, week value)
  over a responsive grid of rich session tiles. Browse-everything-at-a-glance.
- **B — Mission control table** (`?variant=B`): thin left ops rail + a dense, sortable,
  filterable table of every session. Power-user, many-sessions, scan-rows.
- **C — Triage rail** (`?variant=C`): organized by attention, not enumeration. Waiting
  sessions are big action cards up front; account-health rings are the hero on the right.

All three share: state model (Working / Waiting / Idle / Ended, Waiting surfaced loudest),
Managed vs Observed chips, equivalent-API-value cost, context %, model.

## Workspace (shared drill-down)

Terminal mock for Managed sessions, read-only rendered transcript for Observed. Right rail:
context breakdown, cost + cache savings, account limits. Bottom tabs: tasks (with deps),
subagent tree, timeline. Action button is state-aware: Adopt when Ended, Fork when alive.

## Verdict

**B — Mission control table — won.** Density scales to many parallel sessions (the real
use case; some days hit 50+), and sort/filter make it a tool rather than a poster.

The graft worth making: B's table is right, but flat enumeration buries Waiting, the one
thing that matters most, and sorting by any column scatters the Waiting rows. So fold in
C's "Needs you" strip pinned above the table, and keep Waiting rows pinned regardless of
sort. Plus: subtle live motion on working rows, and a lines-changed column (statusLine
gives it for free).

Next: fold B + the strip into the real Overview, delete A and C, the switcher, and this
prototype folder.
