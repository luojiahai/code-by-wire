import { useMemo, useState } from "react";
import type { Subagent, Task, BackgroundShell } from "@shared/types";
import { Icon } from "../../ui/icons";
import { Tabs } from "../../ui/Tabs";
import type { DocState } from "../use-transcript";
import { DockTasks } from "./DockTasks";
import { SubagentsTab } from "./SubagentsTab";
import { ShellsTab } from "./ShellsTab";
import { OverlayScroll } from "../../ui/OverlayScroll";
import {
  type DockTab,
  type DockCollapseOverride,
  type SubagentStats,
  defaultDockTab,
  dockHasActivity,
  resolveDockCollapsed,
  subagentStats,
} from "./dock-tabs";

/**
 * The Session workspace's bottom Structure dock: a single tabbed section (Tasks / Subagents / Shells)
 * spanning the center column below the live view. Collapses to a thin tally bar so the Transcript
 * can take the full height, and width-gates with the rail (hidden below `lg`) so a narrow window degrades
 * cleanly to just the live view.
 */
export function StructureDock({
  tasks,
  doc,
  shells,
  now,
  activeAgentId,
  activeShellId,
  onDrill,
  onDrillShell,
}: {
  tasks: Task[];
  doc: DocState;
  shells: BackgroundShell[];
  now: number;
  activeAgentId?: string;
  activeShellId?: string;
  onDrill: (agent: Subagent) => void;
  onDrillShell: (shell: BackgroundShell) => void;
}) {
  const [collapseOverride, setCollapseOverride] =
    useState<DockCollapseOverride | null>(null);
  const subagents = doc?.subagents ?? [];
  // One forest walk feeds the count badge, the live tally, and the default tab. Memoized against the
  // subagents identity (stable between polls) so the 3s render clock doesn't re-walk the forest.
  const stats = useMemo(() => subagentStats(subagents), [subagents]);
  const alive = stats.working > 0;
  // The dock hides itself when idle and reveals itself while any tab has a live entry (a working
  // subagent, an in-progress task, or a running shell). A manual collapse/expand overrides that, but
  // only for the current activity phase — the override lapses when activity starts or stops, so the
  // dock re-follows (same lapsing-override shape as the tab-follow `pick` above).
  const active = dockHasActivity(tasks, stats, shells);
  const collapsed = resolveDockCollapsed(active, collapseOverride);
  // The right tab auto-follows the live fan-out (Subagents while alive, Tasks otherwise). A manual pick
  // overrides that, but only for the current fan-out phase: `pick` records the phase (`alive`) it was
  // chosen under, so when the fan-out starts or ends the pick lapses and the tab re-follows. That way a
  // click during a fan-out never strands the user on a now-empty Subagents tab once it finishes.
  const [pick, setPick] = useState<{ tab: DockTab; alive: boolean } | null>(
    null,
  );
  // While a lane is drilled, hold the Subagents tab so the originating lane (and its active ring) stays
  // visible above the drill surface — otherwise the fan-out finishing would auto-flip to Tasks and orphan
  // the open drill. An in-phase manual pick still wins, so the user can deliberately flip to Tasks.
  const tab =
    pick && pick.alive === alive
      ? pick.tab
      : activeShellId
        ? "shells"
        : activeAgentId
          ? "subagents"
          : defaultDockTab(stats);

  if (collapsed)
    return (
      <DockTally
        tasks={tasks}
        stats={stats}
        shellCount={shells.length}
        onExpand={() => setCollapseOverride({ collapsed: false, active })}
      />
    );

  return (
    <div className="hidden h-64 shrink-0 flex-col border-t border-ink-800 bg-ink-925 lg:flex">
      <DockTabBar
        tab={tab}
        onChange={(t) => setPick({ tab: t, alive })}
        taskCount={tasks.length}
        subagentCount={stats.total}
        shellCount={shells.length}
        onCollapse={() => setCollapseOverride({ collapsed: true, active })}
      />
      <OverlayScroll className="min-h-0 flex-1">
        {tab === "tasks" ? (
          <DockTasks tasks={tasks} />
        ) : tab === "subagents" ? (
          <SubagentsTab
            subagents={subagents}
            now={now}
            activeAgentId={activeAgentId}
            onDrill={onDrill}
          />
        ) : (
          <ShellsTab
            shells={shells}
            now={now}
            activeShellId={activeShellId}
            onDrill={onDrillShell}
          />
        )}
      </OverlayScroll>
    </div>
  );
}

/** The dock's tab bar: the shared lozenge Tabs of Tasks / Subagents / Shells (each with a count) plus a
 *  collapse glyph. */
function DockTabBar({
  tab,
  onChange,
  taskCount,
  subagentCount,
  shellCount,
  onCollapse,
}: {
  tab: DockTab;
  onChange: (t: DockTab) => void;
  taskCount: number;
  subagentCount: number;
  shellCount: number;
  onCollapse: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-ink-800 px-3 py-1.5">
      <Tabs<DockTab>
        tabs={[
          { id: "tasks", label: "Tasks", count: taskCount },
          { id: "subagents", label: "Subagents", count: subagentCount },
          { id: "shells", label: "Shells", count: shellCount },
        ]}
        value={tab}
        onChange={onChange}
        variant="lozenge"
      />
      <button
        type="button"
        onClick={onCollapse}
        aria-label="Collapse structure dock"
        title="Collapse"
        className="ml-auto inline-flex items-center justify-center rounded-sm p-1 text-fg-faint transition-colors hover:text-fg"
      >
        <Icon name="chevron-down" size={14} />
      </button>
    </div>
  );
}

/** The collapsed dock: a thin, full-width button summarizing tasks, subagents, and shells — the expanded
 *  dock's tab order. Clickable to expand. Carries the same `lg` width gate as the expanded dock. */
function DockTally({
  tasks,
  stats,
  shellCount,
  onExpand,
}: {
  tasks: Task[];
  stats: SubagentStats;
  shellCount: number;
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
      <span className="text-meta font-semibold uppercase tracking-wider text-fg-muted">
        Structure
      </span>
      <span className="ml-auto flex items-center gap-3 font-mono text-label tabular-nums text-fg-faint">
        <span>
          {tasksDone}/{tasks.length} tasks
        </span>
        <span>
          {stats.total} subagents
          {stats.working > 0 ? ` · ${stats.working} working` : ""}
        </span>
        <span>{shellCount} shells</span>
      </span>
    </button>
  );
}
