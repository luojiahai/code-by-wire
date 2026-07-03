# <img src="docs/assets/logo.svg" alt="" height="64" align="center"> Code-by-wire

English | [简体中文](README.zh-CN.md)

[![CI](https://img.shields.io/github/actions/workflow/status/luojiahai/code-by-wire/ci.yml?style=flat-square&label=CI)](https://github.com/luojiahai/code-by-wire/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/luojiahai/code-by-wire?style=flat-square)](https://github.com/luojiahai/code-by-wire/releases)
[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-db61a2?style=flat-square&logo=github&logoColor=white)](https://github.com/sponsors/luojiahai)

Claude Code writes a rich trail to the `.claude` directory as it works: every
turn, every token, every tool call, the running cost, the context window. The
CLI shows you almost none of it.

Code-by-wire reads that trail and turns it into one live dashboard. Every
session on your machine in one place, with live state, the full transcript, an
embedded terminal to drive or take over, and the telemetry the terminal hides.
One pane instead of a dozen terminal windows.

![Code-by-wire: a live Claude Code session with the session rail, transcript, and telemetry panels](docs/assets/cbw-screenshot.png)

## Download

One click starts the download. Always the latest release.

| Platform              | File                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| macOS · Apple Silicon | [`Code-by-wire-arm64.dmg`](https://github.com/luojiahai/code-by-wire/releases/latest/download/Code-by-wire-arm64.dmg)             |
| macOS · Intel         | [`Code-by-wire-x64.dmg`](https://github.com/luojiahai/code-by-wire/releases/latest/download/Code-by-wire-x64.dmg)                 |
| Windows · x64         | [`Code-by-wire-Setup-x64.exe`](https://github.com/luojiahai/code-by-wire/releases/latest/download/Code-by-wire-Setup-x64.exe)     |
| Windows · ARM64       | [`Code-by-wire-Setup-arm64.exe`](https://github.com/luojiahai/code-by-wire/releases/latest/download/Code-by-wire-Setup-arm64.exe) |

## What you get

- **Every session in one rail.** A searchable sidebar that groups every session
  by project into collapsible folders, each row flagging its own live state.
- **Drive, fork, or just watch.** Spawn a managed session in an embedded
  terminal, fork a live one, adopt one you started elsewhere, or observe it
  read-only.
- **The full transcript.** Every message, tool call, and result, reconstructed
  from disk and rendered cleanly.
- **The telemetry the CLI hides.** Live context pressure, spend, token
  throughput, duty cycle, git, tasks, subagents, and background shells, per
  session.
- **The whole story.** A cross-session Stats view with a year-long contributions
  calendar and exact, never-estimated totals.
- **Your rate limits in view.** Reads your account's rate-limit windows straight
  from the `.claude` directory, with live reset countdowns.

## Features

Nothing to set up. Open the app and every session already running on your
machine is there.

### 👀 See every session at a glance

**Grouped by project, folded to taste.** The sidebar buckets every session into
a collapsible folder per project, newest activity first, with a running count on
each folder and a total up top. Inside a folder, live sessions sort above ended
ones, and each row carries a small state dot — working, waiting, idle, or ended.

**Search as you type.** A box at the top of the rail filters the whole list by
session name or project the moment you start typing.

### 🕹️ Start, drive, or watch any session

**Start one in a click.** New session picks a directory and a model, then spawns
Claude Code in an embedded terminal. Fork a live session to branch a fresh copy
from where it left off, or end a running one from the menu in its header.

**Observe safely, adopt later.** A session you started elsewhere shows up
read-only, because two processes writing one transcript would corrupt it. Once
it ends, adopt it to resume inside the app and take the controls. Adopt unlocks
only when the original process is gone, the only time it's safe.

**Terminal or transcript.** A managed session toggles between its live terminal
and the rendered transcript. Switching away only detaches the view. The terminal
keeps buffering, so you never lose scrollback.

**Label it, open it.** Rename any session inline to whatever you'll recognize it
by, copy its id, or open its working directory in VS Code or your file browser.

### 📜 Read exactly what the agent did

**The full transcript, step by step.** Every message, tool call, and tool
result, reconstructed from the raw transcript on disk and rendered cleanly.

**A dock that follows the work.** Below the live view, the Structure dock tabs
through the session's makeup and snaps to whatever's happening, collapsing to a
one-line tally when nothing's live:

- **Tasks.** The task list with each item's status and what it's blocked by.
- **Subagents.** The child sessions a session spawned, as a live list you can
  drill into.
- **Shells.** Background shells the session kicked off, reconstructed from the
  transcript, with their full output on demand.

### 📊 The telemetry Claude Code keeps out of sight

Select a session and a right-hand rail of live panels reads it out:

- **Pressure.** How full the context window is, using Claude's own number when
  it reports one, over your account's rate-limit windows — 5-hour, 7-day, and
  per-model weekly buckets when present — each a bar with percent used and a
  live reset countdown. Bars warm to amber and redline as they fill.
- **Spend.** Total tokens with Claude Code's own dollar figure beside it, broken
  out by kind: fresh input, generated output, cache reads, and the 5-minute and
  1-hour cache writes. On a subscription the dollar figure is _equivalent API
  value_, what the tokens would cost at API rates, never money owed.
- **Throughput.** Live token rate over a rolling window, output and input.
- **Duty.** The session's duty cycle — how much of the wall clock the API was
  actually working.
- **Session.** Model, effort, and the run clock, plus git (branch, dirty state,
  ahead/behind), any linked pull request, lines added and removed, and time
  since the last activity.

### 📈 The whole story across every session

**Stats is where the app opens.** Reached from the rail's top menu, it totals
every Claude Code session on your machine, not just the one you're watching. Pick
a range: Today, 7d, 30d, 90d, or All.

**Headline numbers.** A grid of the figures worth knowing at a glance — sessions,
tokens, your favorite model, active days, most active day, longest session, and
your longest and current daily streaks.

**A contributions calendar.** A year of activity as a token heatmap. Switch the
window between the trailing twelve months and any past year, and click any day to
scope the whole page to it.

**Tokens per day.** One stacked bar per day, split by model, alongside a by-model
breakdown for the range.

**Two more ways to slice it.** By project, with each project's work folded in,
and by session in a sortable table. An _Include cache_ toggle decides whether
cached tokens count toward the totals.

**Exact, never estimated.** Every number is read straight from the transcripts
on disk, deduped and totalled. No sampling, no guesses. The first launch
backfills your history behind a progress bar, then it stays live like everything
else — and you can reset and rebuild it from scratch anytime.

### ⚙️ Settings and CLI health

**Settings** opens from the rail's top menu, in two sections. **System** checks
your local Claude Code — whether it's found, current, and logged in — and hands
you the exact fix when something's off, plus a field to point the app at a
non-standard binary. It also flags a duplicate install or a config-directory
mismatch. The System tab wears a caution badge that lights amber or red the
moment the CLI needs attention, so a broken or logged-out install never slips by.
**About** carries the app version and handles software updates.

## Install

Grab the installer from [Download](#download) above, or build it yourself.

### First launch

On macOS, open the `.dmg` and drag Code-by-wire to Applications, then launch it.
The app is signed and notarized by Apple, so it opens straight away, no Gatekeeper
warning and no quarantine workaround.

On Windows, run the `.exe`. It's unsigned for now, so Windows SmartScreen may warn.
Click **More info → Run anyway**.

Once installed, Code-by-wire keeps itself current: it checks for new releases on
launch and lets you download and install them from Settings → About. You can turn
the launch check off there.

### Build from source

Build an unsigned app locally instead. Run the command for your platform:

```
pnpm install
pnpm rebuild:native   # rebuild better-sqlite3 + node-pty for Electron's ABI
pnpm dist             # macOS: writes the .dmg to release/
pnpm dist:win         # Windows: writes the .exe to release/
```

On macOS, open the `.dmg` from `release/` and drag Code-by-wire to Applications.
Because it's unsigned, the first launch may need a right-click → **Open**, or
clearing the quarantine flag:

```
xattr -dr com.apple.quarantine /Applications/Code-by-wire.app
```

On Windows, run the `.exe` from `release/`. It's unsigned, so SmartScreen may
warn — click **More info → Run anyway**.

## Requirements

- macOS (Apple Silicon or Intel) or Windows (x64 or ARM64)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed
  locally, so there are sessions to observe and control

## Develop

```
pnpm install
pnpm rebuild:native   # rebuild better-sqlite3 + node-pty for Electron's ABI
pnpm dev              # launch the app
```

`pnpm test` runs the provider read tests over the redacted `.claude` fixtures
in `tests/fixtures/`. `pnpm typecheck` checks the main and renderer projects.

This is a personal project and isn't taking outside code, but bug reports and
ideas are welcome. [Open an issue](https://github.com/luojiahai/code-by-wire/issues/new/choose),
or see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
