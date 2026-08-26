---
id: ru_01M0YXZK4H3V73GS8D5Q
type: architecture
paths:
  - "src/main/provider/claude/**"
  - "src/shared/overview.ts"
source: "https://github.com/luojiahai/code-by-wire/pull/17"
notam: true
---

Derive session state where both liveness and the transcript are in scope, and never filter out sessions whose process has died — a dead process must surface as an Ended state, not disappear.

The review note on the issue required derivation to move up so liveness feeds it, and required the dead-pid filter to be removed; the author confirms the change 'honors the review note (liveness feeds derivation, no filter)'.
