---
title: "Introducing Code-by-wire"
description: "Claude Code writes a rich trail to disk as it works. Code-by-wire turns it into a live dashboard."
publishDate: "2026-07-12"
---

Claude Code writes a rich trail to the `.claude` directory as it works — every
turn, every token, every tool call, the running cost, the context window. The
CLI shows you almost none of it.

Code-by-wire reads that trail and turns it into one live dashboard — every
session on your machine, with live state, the full transcript, an embedded
terminal to drive or take over, and the telemetry the terminal hides.

## What you get

- **Every session in one rail.** Grouped by project, searchable, each row
  flagging its live state — working, waiting, idle, or ended.
- **Drive, fork, or just watch.** Spawn a session in an embedded terminal, fork
  a live one, adopt one you started elsewhere, or observe it read-only.
- **The full transcript.** Every message, tool call, and result, reconstructed
  from disk and rendered cleanly.
- **The telemetry the CLI hides.** Context pressure, spend, token throughput,
  duty cycle, git, tasks, subagents, and background shells — live, per
  session.

[Download it](/download/) and open it — every session already
running on your machine is there.
