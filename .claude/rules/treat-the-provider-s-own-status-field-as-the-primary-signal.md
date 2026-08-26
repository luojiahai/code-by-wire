---
id: ru_01M0YXZK4HWCDZBRY9VS
type: architecture
paths:
  - "src/main/provider/claude/state.ts"
source: "https://github.com/luojiahai/code-by-wire/pull/17"
notam: true
---

Treat the provider's own `status` field as the primary signal for session state, and use transcript-tail inference only as a fallback for states the status has not yet reflected.

The author found the heuristic-first ordering was wrong against real data — `status: "waiting"` is written directly and the transcript heuristic does not fire on real waiting transcripts — and reordered so status is primary with the transcript as belt-and-suspenders.
