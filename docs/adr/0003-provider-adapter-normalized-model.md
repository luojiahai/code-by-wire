# Provider-adapter architecture anchored on a normalized model

The app will grow to support Codex and Copilot beyond Claude Code, but their session formats differ and aren't yet reverse-engineered. So the data layer and the UI are built against the app's own normalized model (Session, Turn, Usage, Task, Subagent, RateLimit), and each Provider maps its native data into that model and declares capability flags. v1 ships only ClaudeProvider, with no speculative code for the others.

## Considered options

- **Claude-specific, refactor later** — fastest to ship, but Codex and Copilot would force a data-layer and UI refactor once Claude-native shapes had leaked everywhere.
- **All three providers in v1** — validates the abstraction against real differences immediately, but means decoding two undocumented stores before shipping and dilutes the Claude experience that is the actual wedge.

## Consequences

- The UI never sees a Claude-native shape; it consumes normalized types. Capability flags (canControl, hasRateLimits, hasSubagents) drive graceful degradation for sessions or providers that can't do something.
- The seam's correctness can't be fully proven until the second provider lands, so expect the interface to shift when Codex or Copilot arrive. That's accepted; one informed adjustment beats a blind abstraction.
