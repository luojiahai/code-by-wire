# Reach into the user's Claude config via statusLine, not hooks

The app needs live cost, context, and account rate-limit data for sessions it did not spawn. The 5-hour and 7-day rate limits exist only in the statusLine JSON Claude Code pipes to its statusLine command; they appear in no file on disk. So the app installs a single statusLine into the user's global `~/.claude/settings.json`, wrapping any existing one so the user's prompt still renders, and has it side-channel the JSON to the app. Hooks stay an opt-in feature rather than a default.

## Considered options

- **Full hook injection by default** — richest real-time event stream, but hooks fire for every session and a faulty PreToolUse hook can block real tool execution. Too much blast radius for something installed on first run.
- **Zero injection** — never touch the user's config, derive everything from files already on disk. Clean and uninstallable, but account rate-limits are simply unavailable, and that's a headline feature.

## Consequences

- The app must detect and wrap an existing statusLine so the user's prompt survives, then capture the JSON for itself.
- Everything degrades gracefully. A session without the app's statusLine still shows tokens, computed cost, context, tasks, subagent graph, and liveness from files. It only loses the rate-limit bars.
- statusLine can never block or stall a session; worst case it renders blank. That safety is the whole reason it is the default and hooks are not.
