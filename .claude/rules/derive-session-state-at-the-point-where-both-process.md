---
id: ru_01M0QD0CNKNXN410NWYV
kind: do
scope:
  - "src/main/provider/claude/*.ts"
source: "https://github.com/luojiahai/code-by-wire/pull/17"
notam: true
---

Derive session state at the point where both process liveness and the transcript are in scope, so liveness feeds the derivation rather than gating it.

The author states the change was made "Per the review note on the issue" and later says the implementation "honors the review note (liveness feeds derivation, no filter)" — a reviewer standard the PR was restructured to satisfy.
