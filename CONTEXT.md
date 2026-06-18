# Code-by-wire

A desktop app for controlling and monitoring local coding agents, Claude Code CLI first. It surfaces the observability data Claude Code keeps out of sight and lets a person run many sessions at once without losing track of any of them.

## Language

**Session**:
A single Claude Code CLI conversation, identified by a session id, with its own transcript.

**Transcript**:
The ordered record of a session's conversation: its messages, tool calls, and tool results. The source of truth the app reads to reconstruct what a session did. Not the same as command history, which is the flat list of prompts a user has typed across all sessions.
_Avoid_: log, conversation, history

**Managed session**:
A session the app spawned and controls. The app can send it input, manage its lifecycle, and read its full state.
_Avoid_: hosted, owned, driven

**Observed session**:
A session the app did not spawn. The app can read its state but can never send input to it.
_Avoid_: external, attached, watched

**Adopt**:
To turn an Observed session into a Managed one by resuming it inside the app. Safe only once the original process is gone (the session has Ended), otherwise two processes write the same transcript.
_Avoid_: take over, claim, capture

**Billing mode**:
Whether an account pays per token (API) or pays a flat subscription (Pro or Max). The app infers it from whether sessions report account rate limits, and it decides how cost is shown.

**Equivalent API value**:
For a subscription account, the dollars the tokens would have cost at API pricing. A reference figure only, never money owed, because a subscription bills a flat fee no matter the token count. On an API account the same figure is real spend.
_Avoid_: cost or spend (when the account is a subscription), notional

**Provider**:
A coding-agent backend the app reads and, where it can, drives. Claude Code is the only Provider in v1; Codex and Copilot are planned. Each Provider maps its native data into the app's normalized model and declares what it can and cannot do.
_Avoid_: backend, integration, adapter, agent

**Subagent**:
A child session a session spawns to do focused work and report back. It has its own transcript and usage. Not the same thing as a Task.
_Avoid_: agent, worker, child

**Task**:
A unit of work tracked in a session's task list, with a status and optional dependencies on other tasks. Not a Subagent, and not a single tool call.
_Avoid_: todo, item, ticket

**Background shell**:
A long-running shell command a session launches to keep working in the background, with its own streamed output. Reconstructed from the transcript and surfaced alongside the session. Not a Subagent and not a Task.
_Avoid_: process, job, terminal

### Session states

**Working**:
A session that is alive and generating output right now.
_Avoid_: busy, running, active

**Waiting**:
A session that is alive but blocked on the user, having asked a question or raised a permission prompt that nothing has answered. The state the app surfaces most loudly.
_Avoid_: blocked, stuck, paused

**Idle**:
A session that is alive and has finished its turn, ready for the next prompt. Not blocked, just done.
_Avoid_: ready, finished, done

**Ended**:
A session whose process is gone, leaving only its transcript behind. A recent session.
_Avoid_: closed, dead, completed

**Fork**:
To start a new session from an existing one's history without disturbing the original. Used in place of Adopt when the original is still alive and so cannot be safely resumed.
_Avoid_: branch, clone, copy
