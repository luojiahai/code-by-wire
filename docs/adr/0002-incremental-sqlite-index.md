# Maintain an incremental SQLite index of .claude data

The Overview needs weekly aggregates and per-session computed cost across 411MB+ of transcripts that only grows, and the app is windowed-only with no background indexer. Re-parsing everything on each launch is too slow, and Claude Code's own `stats-cache.json` is stale by days and zeroes out cost. So the app keeps its own embedded SQLite index, synced incrementally on launch and while open by parsing only files changed since the last run, while the raw JSONL stays the source of truth for a single session's full detail.

## Considered options

- **Parse on demand, in-memory** — simplest, no schema or migrations, but the Overview's weekly aggregates need a slow full scan each launch and cross-session search is impractical.
- **Lean on Claude's stats-cache.json** — least to build, but it's stale, zeroes cost, and is a schema the app doesn't own, so it can break on any Claude Code update.

## Consequences

- A schema and an incremental sync routine become core infrastructure to build, maintain, and migrate.
- Clear split of truth: SQLite is authoritative for aggregates and search; raw transcripts are authoritative for one session's full detail.
- Because sync runs only on launch and while open, stats can sit briefly behind reality until a sync pass finishes. Acceptable for a windowed app.
