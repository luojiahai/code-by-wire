import { useMemo, useState } from "react";
import type { Subagent, Task } from "@shared/types";
import { Icon } from "../../ui/icons";
import { SegmentedTabs } from "../../ui/SegmentedTabs";
import type { DocState } from "../use-transcript";
import { DockTasks } from "./DockTasks";
import { TurnsTab } from "./TurnsTab";
import { SubagentsTab } from "./SubagentsTab";
import { OverlayScroll } from "../../ui/OverlayScroll";
import {
  type DockTab,
  type SubagentStats,
  defaultDockTab,
  subagentStats,
} from "./dock-tabs";

/**
 * The Session workspace's bottom Structure dock: a fixed left Tasks segment plus a tabbed right area
 * (Turns / Subagents), spanning the center column below the live view. Replaces the old standalone
 * Timeline strip. Collapses to a thin tally bar so the Transcript can take the full height, and
 * width-gates with the rail (hidden below `lg`) so a narrow window degrades cleanly to just the live view.
 */
export function StructureDock({
  tasks,
  doc,
  now,
  activeAgentId,
  onDrill,
}: {
  tasks: Task[];
  doc: DocState;
  now: number;
  activeAgentId?: string;
  onDrill: (agent: Subagent) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const subagents = doc?.subagents ?? [];
  const turns = doc?.turns ?? [];
  // One forest walk feeds the count badge, the live tally, and the default tab. Memoized against the
  // subagents identity (stable between polls) so the 3s render clock doesn't re-walk the forest.
  const stats = useMemo(() => subagentStats(subagents), [subagents]);
  const alive = stats.working > 0;
  // The right tab auto-follows the live fan-out (Subagents while alive, Turns otherwise). A manual pick
  // overrides that, but only for the current fan-out phase: `pick` records the phase (`alive`) it was
  // chosen under, so when the fan-out starts or ends the pick lapses and the tab re-follows. That way a
  // click during a fan-out never strands the user on a now-empty Subagents tab once it finishes.
  const [pick, setPick] = useState<{ tab: DockTab; alive: boolean } | null>(
    null,
  );
  // While a lane is drilled, hold the Subagents tab so the originating lane (and its active ring) stays
  // visible above the drill surface — otherwise the fan-out finishing would auto-flip to Turns and orphan
  // the open drill. An in-phase manual pick still wins, so the user can deliberately flip to Turns.
  const tab =
    pick && pick.alive === alive
      ? pick.tab
      : activeAgentId
        ? "subagents"
        : defaultDockTab(stats);

  if (collapsed)
    return (
      <DockTally
        tasks={tasks}
        turnCount={turns.length}
        stats={stats}
        onExpand={() => setCollapsed(false)}
      />
    );

  return (
    <div className="hidden h-64 shrink-0 border-t border-ink-800 bg-ink-925 lg:flex">
      <OverlayScroll
        className="w-72 shrink-0 border-r border-ink-800"
        contentClassName="p-3"
      >
        <DockTasks tasks={tasks} />
      </OverlayScroll>
      <div className="flex min-w-0 flex-1 flex-col">
        <DockTabBar
          tab={tab}
          onChange={(t) => setPick({ tab: t, alive })}
          turnCount={turns.length}
          subagentCount={stats.total}
          onCollapse={() => setCollapsed(true)}
        />
        <OverlayScroll className="min-h-0 flex-1">
          {tab === "turns" ? (
            <TurnsTab turns={turns} now={now} />
          ) : (
            <SubagentsTab
              subagents={subagents}
              stats={stats}
              now={now}
              activeAgentId={activeAgentId}
              onDrill={onDrill}
            />
          )}
        </OverlayScroll>
      </div>
    </div>
  );
}

/** The dock's tab bar: the shared SegmentedTabs pill of Turns / Subagents (each with a count) plus a
 *  collapse glyph. */
function DockTabBar({
  tab,
  onChange,
  turnCount,
  subagentCount,
  onCollapse,
}: {
  tab: DockTab;
  onChange: (t: DockTab) => void;
  turnCount: number;
  subagentCount: number;
  onCollapse: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-ink-800 px-3 py-2">
      <SegmentedTabs<DockTab>
        tabs={[
          { id: "turns", label: "Turns", count: turnCount },
          { id: "subagents", label: "Subagents", count: subagentCount },
        ]}
        value={tab}
        onChange={onChange}
      />
      <button
        type="button"
        onClick={onCollapse}
        aria-label="Collapse structure dock"
        title="Collapse"
        className="ml-auto inline-flex items-center justify-center rounded p-1 text-fg-faint transition-colors hover:text-fg"
      >
        <Icon name="chevron-down" size={14} />
      </button>
    </div>
  );
}

/** The collapsed dock: a thin, full-width button summarizing tasks, turns, and subagents, clickable to
 *  expand. Carries the same `lg` width gate as the expanded dock. */
function DockTally({
  tasks,
  turnCount,
  stats,
  onExpand,
}: {
  tasks: Task[];
  turnCount: number;
  stats: SubagentStats;
  onExpand: () => void;
}) {
  const tasksDone = tasks.filter((t) => t.status === "completed").length;
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label="Expand structure dock"
      title="Expand"
      className="hidden w-full shrink-0 items-center gap-3 border-t border-ink-800 bg-ink-925 px-4 py-2 text-left text-fg-muted transition-colors hover:text-fg lg:flex"
    >
      <Icon name="chevron-up" size={14} />
      <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
        Structure
      </span>
      <span className="ml-auto flex items-center gap-3 font-mono text-[10px] tabular-nums text-fg-faint">
        <span>
          {tasksDone}/{tasks.length} tasks
        </span>
        <span>{turnCount} turns</span>
        <span>
          {stats.total} subagents
          {stats.working > 0 ? ` · ${stats.working} working` : ""}
        </span>
      </span>
    </button>
  );
}
