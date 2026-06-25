# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.16] - 2026-06-25

### Changed

- One-click downloads. Release artifacts are now stable-named, with the version dropped from the filenames (`Code-by-wire-arm64.dmg`, `Code-by-wire-Setup-x64.exe`, and so on), so GitHub's `releases/latest/download/...` URLs always resolve to the newest build. The README swaps its releases-page links for a Download table that links straight to each file, and the Chinese README tracks the same change.

## [0.1.15] - 2026-06-25

### Added

- Assistant transcript messages now render as Markdown: GitHub-flavored tables, lists, and inline formatting, with fenced code blocks syntax-highlighted by Shiki (vitesse-dark). Each code block leads with a language label that swaps to a copy button on hover, and every assistant bubble carries an icon-only copy button.
- The live terminal restores its screen on a window refresh. The terminal manager records each pty's screen state and replays it on reattach, so reloading the window no longer drops the terminal to a blank panel.

### Fixed

- Dropped the border on the selected session row, along with the leftover transparent border on the others.

## [0.1.14] - 2026-06-25

### Fixed

- The Overview's equivalent API value now honors the Include cache toggle everywhere it appears. Totals, per-model, per-project, per-branch, per-session, and per-calendar-day all recompute when the cache pill flips, instead of holding a stale cache-inclusive figure.
- The by-session cost sort follows the cache toggle, so the table reorders to match the values shown.
- Daily-usage tooltip model rows honor the cache toggle, and per-kind cost appears in the tooltip when the cache pill is off.

## [0.1.13] - 2026-06-24

### Added

- Tool turns in the transcript render as compact status rows. Click to open the full command and output in a modal; edit turns open as a compact diff row that launches the same diff modal, with the full path and a copy button in a dedicated file bar.
- Subagent transcripts are now clickable from a parent session, using the same tool and edit detail modals.
- Daily usage buckets in the Overview are priced: total, per-kind, and per-model costs show in each bar, with the equivalent API value in the tooltip.
- The by-session table now shows the session name and a copiable session ID.
- Shell drill-in gains a status header, the shell description in the breadcrumb, and a calmer no-output note when the shell produced nothing.

### Changed

- Transcript avatars switched from initials to icons — circle-user for the human, sparkles for the assistant — with accessible speaker labels.
- Dock tabs (Turns, Tasks, Shells, Subagents) rebuilt on shared dock-row primitives: hairline rows, a mono metric rack with dimmed units, and flat Gantt fill for the subagent timeline.
- Shell rows now lead with the description; the exit code cell is dropped.
- Subagent type and description appear in the drill-in breadcrumb.
- Annunciator cells rebalanced: model and effort split into separate cells; git is wider, effort and clock are narrower.
- Dropped the read-only corner tag from the transcript header.

### Fixed

- Teal keyboard-focus ring restored on controls that had reverted to the OS accent color.
- Shell drill-in remounts when the active shell changes.
- Shell header status is now tied to its own row, not the last one in the list.
- Diff and tool-result copy buttons are disabled when there is nothing to copy and flash "Copied" on success.
- Transcript tool turns constrained to the message box width.
- Daily-usage cost readout calculation and by-session naming corrected.
- New session button is full-width and padded to match session rows.

## [0.1.12] - 2026-06-23

### Added

- Apple Intel (macOS x64) and Windows ARM64 builds, bringing each release to four
  download targets. The Intel Mac dmg cross-compiles on the Apple Silicon runner
  instead of waiting on a scarce `macos-13` runner, and every artifact now carries
  an explicit arch in its filename so the legs no longer clobber on upload or
  collide in the auto-update manifests.

### Changed

- Replaced the in-app wire-mark logo with the terminal `>_` glyph, so the header
  wordmark and the Settings About section now match the `>_` app icon. Regenerated
  the bundle icons from the SVG.

## [0.1.11] - 2026-06-23

### Changed

- Redesigned the app icon as a `>_` prompt mark — a chevron and an underscore
  cursor — on a teal tile, replacing the dark wire-mark tile.

### Fixed

- The annunciator model readout no longer shows a stale family beside a fresh id.
  After a mid-session `/model` switch the live id updates immediately while the
  transcript-derived family lags, so switching Sonnet to Opus briefly read
  "Sonnet (claude-opus-4-8)". The label now takes its family from the live id.

## [0.1.10] - 2026-06-22

### Added

- Fork — `claude --resume <id> --session-id <new> --fork-session` — branches a
  conversation into a brand-new session, inheriting the source history while
  leaving the original transcript untouched. A labeled Fork button rides every
  session in the header; Adopt (resume under the same id) joins it once the
  session has ended. So Fork branches this conversation into a fresh session,
  Adopt takes the wheel of this exact one.
- A Terminal tab on every session: the live xterm for a running managed session,
  otherwise a dark observed-terminal hero that offers Fork always and Adopt only
  once the session has ended. The Transcript stays the default tab for
  non-managed sessions.
- An End session button in the header that terminates a running, app-owned
  session. Ending an idle or waiting session is immediate; a session mid-turn
  routes through a danger-toned confirm, since the kill cuts the turn. The
  conversation is durable, so it stays recoverable via Adopt either way.
- Inline rename of the session title from the header. Hover to reveal a pencil,
  click the pencil or the title to edit in place; Enter or blur saves, Esc
  cancels, and an empty value clears the override to revert to the derived name.
  The override lives in its own durable store, so a deliberate rename wins over
  both the re-derived title and Claude's live `session_name` and survives the 3s
  re-derive, a cache rebuild, and app restart.

### Fixed

- The Adopt button no longer flickers across the resume sync race. Adopting an
  ended session now holds Working through the `--resume` boot instead of bouncing
  ended → working → ended → idle, and a just-exited session shows Adopt disabled
  with a tooltip instead of dropping it for a beat until the next sync lands.

## [0.1.9] - 2026-06-21

### Added

- An "Open in" menu on the session header that opens the working directory in
  VSCode or the OS file browser (Finder on macOS, Explorer on Windows). It
  resolves the folder from the registry or the transcript, so it works for ended
  and observed sessions too, and surfaces a deleted or unresolvable folder as an
  inline error instead of a dead click.
- Drilling from a subagent's inline dispatch in a transcript straight into that
  subagent's own transcript, and on through nested subagents. The breadcrumb
  grows a level at a time (`Session › A › B`) and pops back the same way, and a
  dispatch is clickable only when its agent resolves on disk.

### Changed

- Redesigned the Git cell into a minimal branch readout that opens a detail
  popover. The cell shows the branch name, or the short sha on a detached HEAD,
  with an amber dot when the tree is dirty; the popover holds the repository
  link, copyable branch and commit, the pull request link, and sync, changes,
  and status rows.
- Widened API-billing detection to cover a bare `ANTHROPIC_API_KEY` or
  `ANTHROPIC_AUTH_TOKEN` (direct Anthropic) and the cloud-provider flags
  (Bedrock, Vertex, Foundry, and the rest), not just an explicit base URL. The
  rail names the gateway provider and gives cloud accounts a friendly name ("AWS
  Bedrock", "Google Vertex", "Microsoft Foundry"). Cost drops the `~` only for
  live, direct Anthropic spend; gateways keep the estimate framing.
- Unified the By model and By project breakdowns in the Overview into one shared
  panel of full-width bars with a column header, both capped at the top 7 with a
  "+N more" note.
- Dropped the Saira display font. Labels now reuse Inter and lean on case,
  tracking, and weight for hierarchy, and the wordmark takes its own face,
  uppercase Cascadia Mono, for a stamped terminal-brand feel.
- Folded the standalone Sys lamp into the Settings gear, which now carries the
  CLI master-caution as a corner badge that stays dark until the CLI trips.
- Restyled the selected session card as a raised, teal-bordered card in place of
  the leading accent bar.
- The Model cell now shows the raw model id beside the family, like
  `Opus (claude-opus-4-8[1m])`, truncated with the full id on hover.

### Fixed

- The macOS app icon renders full-size on macOS Tahoe instead of shrinking into
  a grey rounded frame, by shipping the art full-bleed and letting Tahoe supply
  the corner mask.
- Tidied the Overview stats chrome: Y-axis tick labels trim a trailing `.00` and
  center on their gridlines, the daily chart gains headroom under its title, and
  the year dropdown aligns without flashing on a year change.
- The collapsed Structure tally now matches the expanded tab order (Tasks,
  Subagents, Shells, Turns) and includes the shells count it was missing.

## [0.1.8] - 2026-06-20

### Added

- A Settings view, reached from a title-bar gear, with System, Account,
  Appearance, and About sections. System is the new home for the Claude Code CLI
  status: its detail, version requirement, binary-path override, and per-install
  remedy commands. A title-bar Sys lamp and a master-caution banner both
  deep-link into it. Account carries the subscription identity and rate-limit
  gauges.

### Changed

- Rethemed the whole UI to an "Instrument" glass-cockpit direction: neutral
  graphite surfaces, a type stack of Saira Semi Condensed for placards, Inter for
  the UI, and JetBrains Mono for telemetry, with color reserved for live state.
  Dropped the Space Grotesk and Hanken Grotesk fonts.
- Flattened the rail's session list and moved the CLI status off it onto a
  title-bar Sys master-caution lamp.
- Reworked the session cockpit around an annunciator header (state, link, model
  and effort, git, and a clock) above a three-panel sidebar: a Context fuel
  gauge, a merged Tokens panel, and a token-speed sparkline.
- Ported the Overview to the Instrument palette with selective color. A fixed
  identity color per known model (Fable, Opus, Sonnet, Haiku) carries across the
  By-model breakdown, the daily stack, and the session log; input and output are
  tinted in the kind breakdowns; and the contributions calendar picks up an
  engaged-blue heat. The by-project breakdown flattened to a monochrome list,
  dropping the per-branch view.

### Removed

- The standalone CLI status modal, now folded into Settings → System.

### Fixed

- The daily usage by-kind chart now honors the page's "Include cache" toggle,
  folding cache out to leave input and output when the toggle is off instead of
  always rendering the full token composition.

## [0.1.7] - 2026-06-20

### Added

- Windows (x64) support: a downloadable NSIS installer, plus parity for spawning,
  adopting, live telemetry, and CLI detection.

### Changed

- Validate a session's working directory before spawn, surfacing the reason
  ("Starting directory does not exist") instead of a bare "[process exited]".

## [0.1.6] - 2026-06-18

### Added

- A Shells tab in the dock that lists each session's background shells,
  reconstructed from the transcript, and lets you drill into any shell's full
  log on the main surface with a live tail and ANSI colors.
- A reset control in the Overall Stats view that drops and rebuilds the
  analytics index from scratch, behind a danger-tone confirmation.
- An email reveal toggle in the account rail that masks the subscription email
  by default, so you can demo the app without exposing it.

### Changed

- Rebuilt the left sidebar as a single rail panel: the account card opens the
  Overview, sessions render as cards with a state-icon tile where the icon shape
  encodes session state and its tone encodes management, and the CLI status sits
  in a band below the account card with its version. The CLI status modal moved
  onto the shared modal shell around one dynamic banner.
- Split the session list into Active and Ended zones by creation time — a
  headerless Active list above a collapsible Ended section — and froze each
  session's creation time to its earliest transcript timestamp so the order
  holds across reparses.
- Reworked the dock tabs: underline and lozenge tab styles, Tasks folded into
  the dock as a tabbed section, and the idle dock defaulting to Tasks when a
  session has any.
- Restyled subagent lanes into single-row, description-first bands.
- Gave the session list, workspace, stats, and dock a VSCode-style overlay
  scrollbar that reveals on hover without taking layout space.

### Fixed

- Spawned sessions now inherit the resolved `CLAUDE_CONFIG_DIR`, so a relocated
  Claude config directory carries into sessions the app starts.

## [0.1.5] - 2026-06-17

### Added

- A live CLI status block at the bottom of the rail that probes the local Claude
  Code CLI on startup and classifies it as ready, not found, outdated, logged
  out, or unknown. It resolves the binary across a saved override, your
  login-shell PATH, and a fallback, recovers a relocated `CLAUDE_CONFIG_DIR`,
  flags multiple installs, and enforces a minimum version (2.1.177). A spinner
  and Re-check button rerun the probe on demand, and a Troubleshoot modal
  explains the failure with per-install-method (native, Homebrew, npm) upgrade
  commands and a binary-path override. New session and Adopt are disabled while
  the CLI is unusable.

### Changed

- Hide Claude Code background (`--bg`) sessions from the session list, including
  ones that have already ended — read from the transcript's recorded session
  kind, since the registry entry is reaped the moment the session exits.

### Fixed

- Keep the terminal prompt reachable at the bottom after a relayout or
  re-attach, not just a session switch, by rebuilding the xterm viewport
  geometry the way VSCode does.

## [0.1.4] - 2026-06-16

### Added

- Subagent lanes in the dock: each session's subagents render as a live gantt
  timeline, grouped into collapsible per-batch bands ordered by start time, with
  the task description and tool count on each lane and a status tally. Drill into
  any lane to open that subagent's transcript on the main surface, with a
  breadcrumb back to the session.
- Shift+Enter in the terminal inserts a newline in the Claude Code prompt instead
  of submitting, matching what `/terminal-setup` wires for a native terminal.

### Changed

- Recolored charts and telemetry with a token-kind palette: wire-blue is reserved
  for interaction and brand, with steel for Input, violet for Output, and teal as
  the analytics hue across the cost donut, token bars, KPI strip, contributions
  heatmap, model-mix donut, and right rail.
- Neutralized the text scale to graphite and lifted tertiary contrast.

### Fixed

- Keep the terminal scrollback pinned to the bottom after switching sessions.

## [0.1.3] - 2026-06-15

### Added

- Overall Stats view, pinned as an Overview entry at the top of the rail and
  served from the SQLite analytics index: a headline KPI strip, a GitHub-style
  contributions calendar with a metric toggle and year switcher, a daily usage
  chart, per-model, per-project, and per-branch breakdowns, a sortable session
  table, a date-range filter, and a single cache-token toggle.
- App version next to the header wordmark.

### Changed

- Moved Tasks, Turns, and Subagents into a collapsible Structure dock.
- Reworked the model picker: it resolves its default from the configured
  override, offers model aliases (including Fable), shows each session's resolved
  id, and labels a session with no recorded model "Unknown".
- Capitalized the app display name to "Code-by-wire".

### Fixed

- Hold a new session's picked model in the rail until its first turn lands,
  instead of briefly flickering to a default.

## [0.1.2] - 2026-06-12

### Changed

- Releases are now signed with a Developer ID certificate and notarized by
  Apple, so the downloaded `.dmg` opens without a Gatekeeper warning.

## [0.1.1] - 2026-06-12

### Added

- API billing mode in the account rail. It shows host and plan for API-billed
  accounts and tells them apart from Pro/Max subscriptions.
- macOS editing keys in the terminal (Ctrl-A/E, Esc-b/f, Ctrl-W/U/K), so the
  Claude Code prompt answers the usual readline shortcuts.

### Changed

- Moved the New session button into the sidebar.
- Simplified the account rail to host and plan, dropping Auth and Via.
- Made the terminal borderless with an edge scrollbar so it fills its panel.
- Trimmed the global header to 40px.
- Anchored the wordmark top-left, sliding into the corner in fullscreen once the
  traffic lights clear.
- Tightened the Session and Git panel row spacing to match the rail.

### Removed

- Intel (`x64`) builds. Releases are Apple Silicon (`arm64`) only.

### Fixed

- Self-heal a wrapped `settings.json` when its `state.json` goes missing.
- Drop the subscription label once every rate-limit window has expired.
- Force the sRGB color profile so packaged colors match dev.

## [0.1.0] - 2026-06-11

### Added

- First public release. A dark macOS desktop app that monitors and controls
  local Claude Code sessions: one row per session, live state (Working,
  Waiting, Idle, Ended), and transcript, tasks, tokens, cost, and git panels,
  served from an embedded SQLite index.
- Unsigned `.dmg` published to GitHub Releases.

[Unreleased]: https://github.com/luojiahai/code-by-wire/compare/v0.1.16...HEAD
[0.1.16]: https://github.com/luojiahai/code-by-wire/compare/v0.1.15...v0.1.16
[0.1.15]: https://github.com/luojiahai/code-by-wire/compare/v0.1.14...v0.1.15
[0.1.14]: https://github.com/luojiahai/code-by-wire/compare/v0.1.13...v0.1.14
[0.1.13]: https://github.com/luojiahai/code-by-wire/compare/v0.1.12...v0.1.13
[0.1.12]: https://github.com/luojiahai/code-by-wire/compare/v0.1.11...v0.1.12
[0.1.11]: https://github.com/luojiahai/code-by-wire/compare/v0.1.10...v0.1.11
[0.1.10]: https://github.com/luojiahai/code-by-wire/compare/v0.1.9...v0.1.10
[0.1.9]: https://github.com/luojiahai/code-by-wire/compare/v0.1.8...v0.1.9
[0.1.8]: https://github.com/luojiahai/code-by-wire/compare/v0.1.7...v0.1.8
[0.1.7]: https://github.com/luojiahai/code-by-wire/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/luojiahai/code-by-wire/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/luojiahai/code-by-wire/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/luojiahai/code-by-wire/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/luojiahai/code-by-wire/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/luojiahai/code-by-wire/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/luojiahai/code-by-wire/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/luojiahai/code-by-wire/releases/tag/v0.1.0
