---
id: ru_01M0YXZK4H95NQEPFJMV
type: testing
paths:
  - "tests/fixtures/**"
source: "https://github.com/luojiahai/code-by-wire/pull/17"
notam: true
---

Build test fixtures from real, redacted `~/.claude` data rather than hand-written synthetic files, so fixtures cannot encode assumptions the real format violates.

The post-mortem traced a shipped bug to synthetic fixtures that assumed `status ∈ {busy, idle}`: real Claude Code also writes `status: "waiting"`, so blocked sessions rendered Idle and the gap hid until a real session was tested. The comment states fixtures should be tightened toward real redacted data.
