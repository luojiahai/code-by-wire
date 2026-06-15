import { type ComponentPropsWithoutRef, useMemo, useState } from "react";
import type { Subagent } from "@shared/types";
import {
  formatDuration,
  formatRelativeTime,
  formatTokens,
} from "@shared/format";
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
import {
  type CollapseOverride,
  type SubagentGroup,
  groupIsLive,
  groupSpanMs,
  groupStartMs,
  groupSubagents,
  groupUniformType,
  resolveCollapsed,
} from "./subagent-group";

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

/** A fixed-width, right-aligned mono metric in the lane's metadata row (model, tokens, tool count,
 *  duration). `tone` picks the tint; extra props (e.g. aria-label) pass through to the span. */
function LaneCell({
  tone = "text-fg-faint",
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<"span"> & { tone?: string }) {
  return (
    <span
      className={cx(
        "w-12 shrink-0 text-right font-mono text-[10px] tabular-nums",
        tone,
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

/** One Subagent as a Gantt lane: a fill positioned by the agent's start and span within its group's time
 *  window, behind a metadata row (type, model, tokens, tool count, duration) with the task description on
 *  a second line when present. A working lane's bar runs to `now` and its duration ticks live; a finished
 *  lane is frozen at its measured span. */
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
    <li className="relative flex min-h-[26px] flex-col justify-center overflow-hidden rounded-sm bg-ink-900">
      <div
        className={cx(
          "absolute inset-y-0 border-l-2 transition-[left,width] duration-700 ease-out",
          meta.fill,
          meta.cap,
          agent.status === "working" && "animate-pulse-soft",
        )}
        style={{ left: `${band.left}%`, width: `${band.width}%` }}
      />
      <div className="relative px-2 py-1">
        <div className="flex items-center gap-2">
          <span
            className={cx(
              "w-4 shrink-0 text-center font-mono text-[11px]",
              meta.tone,
            )}
          >
            {meta.char}
          </span>
          <span
            className="min-w-0 flex-1 truncate text-[12px] text-fg"
            title={agent.type}
          >
            {agent.type}
          </span>
          <LaneCell>{agent.model ? FAMILY_LABEL[agent.model] : "—"}</LaneCell>
          <LaneCell tone="text-fg-muted">{formatTokens(agent.tokens)}</LaneCell>
          <LaneCell
            aria-label={`${agent.toolCount} tool ${agent.toolCount === 1 ? "call" : "calls"}`}
          >
            {agent.toolCount}
            <span aria-hidden className="ml-0.5">
              ⚒
            </span>
          </LaneCell>
          <LaneCell>{formatDuration(elapsed)}</LaneCell>
        </div>
        {/* pl-6 lines the description up under the type label: glyph w-4 (16px) + the row's gap-2 (8px). */}
        {agent.description && (
          <div
            className="truncate pl-6 pt-0.5 text-[11px] text-fg-faint"
            title={agent.description}
          >
            {agent.description}
          </div>
        )}
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

/** The running / done / failed tally with the batch count on the right, pinned above the bands so the
 *  fan-out's state reads at a glance. */
function SubagentTally({
  stats,
  batchCount,
}: {
  stats: SubagentStats;
  batchCount: number;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-800 bg-ink-925 px-4 py-2 font-mono text-[10px] font-semibold tabular-nums">
      <div className="flex items-center gap-2">
        <TallyTerm
          n={stats.working}
          label="running"
          tone="text-working-bright"
        />
        <span className="text-ink-800">·</span>
        <TallyTerm n={stats.done} label="done" tone="text-ok" />
        <span className="text-ink-800">·</span>
        <TallyTerm n={stats.failed} label="failed" tone="text-danger" />
      </div>
      <span className="font-normal text-fg-faint">
        {batchCount} {batchCount === 1 ? "batch" : "batches"}
      </span>
    </div>
  );
}

/** Per-status counts for one group's mini-tally. */
function groupCounts(agents: Subagent[]): {
  working: number;
  done: number;
  failed: number;
} {
  let working = 0;
  let done = 0;
  let failed = 0;
  for (const a of agents) {
    if (a.status === "working") working++;
    else if (a.status === "failed") failed++;
    else done++;
  }
  return { working, done, failed };
}

/** A group band's clickable header: a chevron, the member count (or "Individual"), the uniform agent
 *  type when there is one, an "auto" hint while auto-collapsed, and a right-aligned status tally, relative
 *  start, and span. */
function GroupHeader({
  group,
  now,
  collapsed,
  autoCollapsed,
  onToggle,
}: {
  group: SubagentGroup;
  now: number;
  collapsed: boolean;
  autoCollapsed: boolean;
  onToggle: () => void;
}) {
  const counts = groupCounts(group.agents);
  const type = groupUniformType(group);
  const start = groupStartMs(group);
  const label =
    group.kind === "individual"
      ? "Individual"
      : `${group.agents.length} agents`;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className="flex w-full items-center gap-2 rounded-sm border-b border-ink-850 px-1 py-1 text-left font-mono text-[10px] tabular-nums transition-colors hover:bg-ink-900"
    >
      <span
        className={cx(
          "w-2.5 shrink-0 text-fg-faint transition-transform",
          collapsed && "-rotate-90",
        )}
        aria-hidden
      >
        ▾
      </span>
      <span className="shrink-0 font-semibold text-fg">{label}</span>
      {type && <span className="min-w-0 truncate text-fg-faint">{type}</span>}
      {autoCollapsed && (
        <span className="shrink-0 italic text-fg-faint/70">auto</span>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-2.5 text-fg-faint">
        <span className="flex items-center gap-1.5">
          {counts.working > 0 && (
            <span className="text-working-bright">◐ {counts.working}</span>
          )}
          {counts.done > 0 && <span className="text-ok">✓ {counts.done}</span>}
          {counts.failed > 0 && (
            <span className="text-danger">✕ {counts.failed}</span>
          )}
        </span>
        {Number.isFinite(start) && (
          <span>{formatRelativeTime(start, now)}</span>
        )}
        <span>{formatDuration(groupSpanMs(group, now))}</span>
      </span>
    </button>
  );
}

/** One group as a band: its header plus, when expanded, its lanes on the group's own time window with a
 *  per-band "now" playhead while the group is live. */
function SubagentGroupBand({
  group,
  now,
  collapsed,
  autoCollapsed,
  onToggle,
}: {
  group: SubagentGroup;
  now: number;
  collapsed: boolean;
  autoCollapsed: boolean;
  onToggle: () => void;
}) {
  const win = laneWindow(group.agents, now);
  const live = groupIsLive(group);
  const nowPct = spanPct(now - win.start, win.end - win.start);
  return (
    <div>
      <GroupHeader
        group={group}
        now={now}
        collapsed={collapsed}
        autoCollapsed={autoCollapsed}
        onToggle={onToggle}
      />
      {!collapsed && (
        <div className="relative mt-1.5">
          {live && (
            <div
              className="pointer-events-none absolute inset-y-0 z-10 w-px bg-working-bright/50 transition-[left] duration-700 ease-out"
              style={{ left: `${nowPct}%` }}
            />
          )}
          <ul className="space-y-1">
            {group.agents.map((a) => (
              <SubagentLane key={a.id} agent={a} win={win} now={now} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * The Structure dock's Subagents tab: a live Gantt grouped by dispatch batch. Each fan-out fired in one
 * assistant turn is its own band on its own time window, coloured by status; lone serial dispatches pool
 * into a trailing "Individual" band on a shared axis. A band auto-collapses once it finishes with no
 * failures; a live band or one with a failure stays open. Clicking a header overrides that until the band
 * flips live to done. A running / done / failed tally and a group count sit above. Shows an empty state
 * until the session spawns a subagent.
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
  // `lanes` and `groups` memoize on the subagents identity (stable between polls): the flatten and the
  // partition only re-run when the forest changes. Each band's window tracks `now` (fresh every render),
  // so it is computed inline inside the band. `stats` is the parent's already-memoized walk.
  const lanes = useMemo(() => flattenSubagents(subagents), [subagents]);
  const groups = useMemo(() => groupSubagents(lanes), [lanes]);
  const [overrides, setOverrides] = useState<Map<string, CollapseOverride>>(
    () => new Map(),
  );
  if (subagents.length === 0) return <EmptyState>No subagents yet.</EmptyState>;
  const toggle = (group: SubagentGroup) =>
    setOverrides((prev) => {
      const next = new Map(prev);
      const current = resolveCollapsed(group, prev.get(group.id));
      next.set(group.id, { collapsed: !current, live: groupIsLive(group) });
      return next;
    });
  return (
    <div>
      <SubagentTally
        stats={stats}
        batchCount={groups.filter((g) => g.kind === "batch").length}
      />
      <div className="space-y-3 px-4 py-3">
        {groups.map((group) => {
          const override = overrides.get(group.id);
          const collapsed = resolveCollapsed(group, override);
          const overridden =
            override !== undefined && override.live === groupIsLive(group);
          return (
            <SubagentGroupBand
              key={group.id}
              group={group}
              now={now}
              collapsed={collapsed}
              autoCollapsed={collapsed && !overridden}
              onToggle={() => toggle(group)}
            />
          );
        })}
      </div>
    </div>
  );
}
