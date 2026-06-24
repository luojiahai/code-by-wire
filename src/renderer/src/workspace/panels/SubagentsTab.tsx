import { useMemo, useState } from "react";
import type { Subagent } from "@shared/types";
import {
  formatDuration,
  formatRelativeTime,
  formatTokensShort,
} from "@shared/format";
import { spanPct } from "../../ui/charts-geom";
import { cx, focusRingInset } from "../../ui/atoms";
import { Icon } from "../../ui/icons";
import { FAMILY_LABEL } from "../../ui/meta";
import { EmptyState } from "./chrome";
import {
  type LaneWindow,
  flattenSubagents,
  laneBand,
  laneInterval,
  laneWindow,
} from "./dock-tabs";
import { DOCK_GUTTER, DockRow, MetricCell, MetricRack } from "./dock-row";
import {
  type CollapseOverride,
  type SubagentGroup,
  groupIsLive,
  groupSpanMs,
  groupStartMs,
  groupSubagents,
  groupUniformType,
  resolveCollapse,
  resolveCollapsed,
} from "./subagent-group";

/** Per-status lane treatment: the glyph char, the duration fill, its left cap, and the glyph tone.
 *  Working pulses; done stays calm so working (blue) and failed (red) pop as the states worth acting on. */
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

/** One Subagent as a Gantt lane: a transparent divider row whose background carries a full-bleed fill
 *  positioned by the agent's start and span within its group's window, plus a right-aligned metric rack
 *  (model, tokens, tool count, duration). A batch lane drops its type (the band header carries it); the
 *  Individual pool keeps a small type tag. A working lane's bar runs to `now` and its duration ticks live;
 *  a finished lane is frozen at its measured span. */
function SubagentLane({
  agent,
  win,
  now,
  active,
  showTypeTag,
  onDrill,
}: {
  agent: Subagent;
  win: LaneWindow;
  now: number;
  active: boolean;
  showTypeTag: boolean;
  onDrill: (agent: Subagent) => void;
}) {
  const meta = LANE_META[agent.status];
  const { start, end } = laneInterval(agent, win.start, now);
  const band = laneBand(start, end, win.start, win.end);
  const elapsed =
    agent.status === "working" && agent.startMs !== undefined
      ? now - agent.startMs
      : agent.durationMs;
  // Description is the label; fall back to the type. The type tag only appears when the description owns
  // the label AND the band header isn't already showing the type.
  const primary = agent.description ?? agent.type;
  const tag = showTypeTag && agent.description ? agent.type : null;
  return (
    <DockRow
      active={active}
      onClick={() => onDrill(agent)}
      aria-label={`Drill into ${agent.type} subagent`}
      fill={
        <div
          className={cx(
            "absolute inset-y-0 border-l-2 transition-[left,width] duration-700 ease-out",
            meta.fill,
            meta.cap,
            agent.status === "working" && "animate-pulse-soft",
          )}
          style={{ left: `${band.left}%`, width: `${band.width}%` }}
        />
      }
      leading={
        <span
          className={cx(
            DOCK_GUTTER,
            "shrink-0 text-center font-mono text-[11px]",
            meta.tone,
          )}
        >
          {meta.char}
        </span>
      }
      trailing={
        <MetricRack>
          <MetricCell width="w-10">
            {agent.model ? FAMILY_LABEL[agent.model] : "—"}
          </MetricCell>
          <MetricCell width="w-16" tone="text-fg-muted" unit="tok">
            {formatTokensShort(agent.tokens)}
          </MetricCell>
          <MetricCell
            width="w-14"
            unit={agent.toolCount === 1 ? "tool" : "tools"}
            aria-label={`${agent.toolCount} tool ${agent.toolCount === 1 ? "call" : "calls"}`}
          >
            {agent.toolCount}
          </MetricCell>
          <MetricCell width="w-12" tone="text-fg-muted">
            {formatDuration(elapsed)}
          </MetricCell>
        </MetricRack>
      }
    >
      {tag && (
        <span className="shrink-0 rounded bg-ink-800 px-1 py-px font-mono text-[9px] text-fg-faint">
          {tag}
        </span>
      )}
      <span
        className="min-w-0 flex-1 truncate text-[12px] text-fg"
        title={primary}
      >
        {primary}
      </span>
    </DockRow>
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
    else if (a.status === "done") done++;
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
      className={cx(
        "flex w-full items-center gap-2 border-b border-ink-850 py-1 pl-2 pr-1.5 text-left font-mono text-[10px] tabular-nums transition-colors hover:bg-ink-900",
        focusRingInset,
      )}
    >
      <Icon
        name="chevron-right"
        size={12}
        className={cx(
          "shrink-0 text-fg-muted transition-transform",
          !collapsed && "rotate-90",
        )}
      />
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

/** The expanded band body: the group's lanes on its own time window, behind a per-band "now" playhead
 *  while the group is live. Rendered only when the band is open, so a collapsed band runs no lane math. */
function SubagentGroupLanes({
  group,
  now,
  activeAgentId,
  onDrill,
}: {
  group: SubagentGroup;
  now: number;
  activeAgentId?: string;
  onDrill: (agent: Subagent) => void;
}) {
  const win = laneWindow(group.agents, now);
  const live = groupIsLive(group);
  // Batch bands have a uniform type shown in the header, so their lanes hide it; the Individual pool
  // (no single type) keeps a per-lane tag.
  const showTypeTag = !groupUniformType(group);
  const nowPct = spanPct(now - win.start, win.end - win.start);
  return (
    <div className="relative mt-1.5">
      {live && (
        <div
          className="pointer-events-none absolute inset-y-0 z-10 w-px bg-working-bright/50 transition-[left] duration-700 ease-out"
          style={{ left: `${nowPct}%` }}
        />
      )}
      <div role="list">
        {group.agents.map((a) => (
          <SubagentLane
            key={a.id}
            agent={a}
            win={win}
            now={now}
            active={a.id === activeAgentId}
            showTypeTag={showTypeTag}
            onDrill={onDrill}
          />
        ))}
      </div>
    </div>
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
  activeAgentId,
  onDrill,
}: {
  group: SubagentGroup;
  now: number;
  collapsed: boolean;
  autoCollapsed: boolean;
  onToggle: () => void;
  activeAgentId?: string;
  onDrill: (agent: Subagent) => void;
}) {
  return (
    <div className="border-t border-ink-850 first:border-t-0">
      <GroupHeader
        group={group}
        now={now}
        collapsed={collapsed}
        autoCollapsed={autoCollapsed}
        onToggle={onToggle}
      />
      {!collapsed && (
        <SubagentGroupLanes
          group={group}
          now={now}
          activeAgentId={activeAgentId}
          onDrill={onDrill}
        />
      )}
    </div>
  );
}

/**
 * The Structure dock's Subagents tab: a live Gantt grouped by dispatch batch. Each fan-out fired in one
 * assistant turn is its own band on its own time window, coloured by status; lone serial dispatches pool
 * into a trailing "Individual" band on a shared axis. A band auto-collapses once it finishes with no
 * failures; a live band or one with a failure stays open. Clicking a header overrides that until the band
 * flips live to done. Shows an empty state until the session spawns a subagent.
 */
export function SubagentsTab({
  subagents,
  now,
  activeAgentId,
  onDrill,
}: {
  subagents: Subagent[];
  now: number;
  activeAgentId?: string;
  onDrill: (agent: Subagent) => void;
}) {
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
    <div className="py-1">
      {groups.map((group) => {
        const { collapsed, isDefault } = resolveCollapse(
          group,
          overrides.get(group.id),
        );
        return (
          <SubagentGroupBand
            key={group.id}
            group={group}
            now={now}
            collapsed={collapsed}
            autoCollapsed={collapsed && isDefault}
            onToggle={() => toggle(group)}
            activeAgentId={activeAgentId}
            onDrill={onDrill}
          />
        );
      })}
    </div>
  );
}
