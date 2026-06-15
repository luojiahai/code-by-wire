import type { TurnSummary } from "@shared/transcript";
import { formatDuration, formatRelativeTime } from "@shared/format";
import { EmptyState } from "./chrome";

/**
 * The Structure dock's Turns tab: the turn-by-turn timeline relocated from its old standalone strip.
 * Each user prompt and the assistant work it triggered, with the turn's tool count, wall-clock duration,
 * and how long ago it started. Oldest first, matching the transcript. Display-only for this slice (no
 * click-to-scroll). `now` comes from the parent's render clock so the relative times tick with the 3s
 * background re-sync.
 */
export function TurnsTab({
  turns,
  now,
}: {
  turns: TurnSummary[];
  now: number;
}) {
  if (turns.length === 0) return <EmptyState>No turns yet.</EmptyState>;
  return (
    <ol className="px-4 py-2">
      {turns.map((t) => (
        <li
          key={t.index}
          className="flex items-baseline gap-3 border-b border-ink-850 py-1.5 last:border-0"
        >
          <span className="w-6 shrink-0 font-mono text-[10px] tabular-nums text-fg-faint">
            {t.index}
          </span>
          <span
            className="min-w-0 flex-1 truncate text-[12px] text-fg"
            title={t.prompt}
          >
            {t.prompt}
          </span>
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-fg-muted">
            {t.toolCount} tool{t.toolCount === 1 ? "" : "s"}
          </span>
          <span className="w-14 shrink-0 text-right font-mono text-[10px] tabular-nums text-fg-muted">
            {formatDuration(t.durationMs)}
          </span>
          <span className="w-16 shrink-0 text-right font-mono text-[10px] tabular-nums text-fg-faint">
            {formatRelativeTime(t.startMs, now)}
          </span>
        </li>
      ))}
    </ol>
  );
}
