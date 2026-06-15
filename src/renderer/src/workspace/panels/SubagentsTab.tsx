import { useMemo } from "react";
import type { Subagent } from "@shared/types";
import { formatDuration, formatTokens } from "@shared/format";
import { spanPct } from "../../ui/charts-geom";
import { cx } from "../../ui/atoms";
import { FAMILY_LABEL } from "../../ui/meta";
import { EmptyState } from "./chrome";
import {
  type LaneWindow,
  type SubagentStats,
  flattenSubagents,
  laneBand,
  laneInterval,
  laneWindow,
} from "./dock-tabs";

/** Per-status lane treatment: the glyph char, the duration fill, its left cap, and the glyph tone.
 *  Working pulses; done stays calm so working (teal) and failed (red) pop as the states worth acting on. */
const LANE_META: Record<
  Subagent["status"],
  { char: string; fill: string; cap: string; tone: string }
> = {
  working: {
    char: "◐",
    fill: "bg-working/20",
    cap: "border-working",
    tone: "text-working-bright",
  },
  done: {
    char: "✓",
    fill: "bg-ok/10",
    cap: "border-ok",
    tone: "text-fg-muted",
  },
  failed: {
    char: "✕",
    fill: "bg-danger/20",
    cap: "border-danger",
    tone: "text-danger",
  },
};

/** One Subagent as a Gantt lane: a fill positioned by the agent's start and span within the shared time
 *  window, behind a metadata row (type, model, tokens, duration). A working lane's bar runs to `now` and
 *  its duration ticks live; a finished lane is frozen at its measured span. */
function SubagentLane({
  agent,
  win,
  now,
}: {
  agent: Subagent;
  win: LaneWindow;
  now: number;
}) {
  const meta = LANE_META[agent.status];
  const { start, end } = laneInterval(agent, win.start, now);
  const band = laneBand(start, end, win.start, win.end);
  const elapsed =
    agent.status === "working" && agent.startMs !== undefined
      ? now - agent.startMs
      : agent.durationMs;
  return (
    <li className="relative h-[26px] overflow-hidden rounded-sm bg-ink-900">
      <div
        className={cx(
          "absolute inset-y-0 border-l-2 transition-[left,width] duration-700 ease-out",
          meta.fill,
          meta.cap,
          agent.status === "working" && "animate-pulse-soft",
        )}
        style={{ left: `${band.left}%`, width: `${band.width}%` }}
      />
      <div className="relative flex h-full items-center gap-2 px-2">
        <span className={cx("shrink-0 font-mono text-[11px]", meta.tone)}>
          {meta.char}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[12px] text-fg"
          title={agent.type}
        >
          {agent.type}
        </span>
        <span className="w-12 shrink-0 text-right font-mono text-[10px] tabular-nums text-fg-faint">
          {agent.model ? FAMILY_LABEL[agent.model] : "—"}
        </span>
        <span className="w-12 shrink-0 text-right font-mono text-[10px] tabular-nums text-fg-muted">
          {formatTokens(agent.tokens)}
        </span>
        <span className="w-12 shrink-0 text-right font-mono text-[10px] tabular-nums text-fg-faint">
          {formatDuration(elapsed)}
        </span>
      </div>
    </li>
  );
}

/** One term of the tally, dimmed to faint when its count is zero so an all-done fan-out reads calm. */
function TallyTerm({
  n,
  label,
  tone,
}: {
  n: number;
  label: string;
  tone: string;
}) {
  return (
    <span className={n > 0 ? tone : "text-fg-faint"}>
      {n} {label}
    </span>
  );
}

/** The running / done / failed tally, pinned above the lanes so the fan-out's state reads at a glance. */
function SubagentTally({ stats }: { stats: SubagentStats }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-ink-800 bg-ink-925 px-4 py-2 font-mono text-[10px] font-semibold tabular-nums">
      <TallyTerm n={stats.working} label="running" tone="text-working-bright" />
      <span className="text-ink-800">·</span>
      <TallyTerm n={stats.done} label="done" tone="text-ok" />
      <span className="text-ink-800">·</span>
      <TallyTerm n={stats.failed} label="failed" tone="text-danger" />
    </div>
  );
}

/**
 * The Structure dock's Subagents tab: a live Gantt of the fan-out. Each Subagent is a lane positioned by
 * its start on a shared time window and coloured by status, with a running / done / failed tally above.
 * Working lanes pulse and run to a cyan "now" playhead that advances each poll; the window steps up in
 * round rungs while live and snaps to the exact span once every lane is done. Flat (the forest is
 * flattened); sorting and drill-in are later slices. Shows an empty state until the session spawns one.
 */
export function SubagentsTab({
  subagents,
  stats,
  now,
}: {
  subagents: Subagent[];
  stats: SubagentStats;
  now: number;
}) {
  // `lanes` is memoized on the subagents identity (stable between polls), so the flatten only re-runs when
  // the forest changes. The window tracks `now`, which is a fresh value every render, so it's computed
  // inline — a useMemo keyed on `now` would never hit. `stats` is the parent's already-memoized walk.
  const lanes = useMemo(() => flattenSubagents(subagents), [subagents]);
  const win = laneWindow(lanes, now);
  if (subagents.length === 0) return <EmptyState>No subagents yet.</EmptyState>;
  const live = stats.working > 0;
  const nowPct = spanPct(now - win.start, win.end - win.start);
  return (
    <div>
      <SubagentTally stats={stats} />
      <div className="px-4 py-3">
        <div className="relative">
          {live && (
            <div
              className="pointer-events-none absolute inset-y-0 z-10 w-px bg-working-bright/50 transition-[left] duration-700 ease-out"
              style={{ left: `${nowPct}%` }}
            />
          )}
          <ul className="space-y-1">
            {lanes.map((a) => (
              <SubagentLane key={a.id} agent={a} win={win} now={now} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
