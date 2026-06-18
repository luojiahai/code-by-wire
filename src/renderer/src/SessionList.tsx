import { useMemo, useState } from "react";
import type { Session, Account } from "@shared/types";
import type { CliStatus } from "@shared/cli-status";
import { RailPanel } from "./ui/RailPanel";
import { RailCliStatus } from "./ui/RailCliStatus";
import { railSections } from "@shared/overview";
import { formatRelativeTime } from "@shared/format";
import { cx, Dot, SessionTile } from "./ui/atoms";
import { OverlayScroll } from "./ui/OverlayScroll";
import { Icon } from "./ui/icons";
import { STATE_META, ctxTone, isContextHigh } from "./ui/meta";

/**
 * The master rail: a headerless Active list (every non-ended session, newest-created first) above a
 * single collapsible Ended section, narrowed by a filter box. Rows are real <button>s, so the list is
 * keyboard- and screen-reader-navigable. Selecting a row opens it in the detail pane to the right.
 */
export function SessionList({
  sessions,
  selectedId,
  onSelect,
  onNew,
  query,
  onQuery,
  account,
  cliStatus,
  onOpenCliStatus,
  canSpawn,
}: {
  sessions: Session[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  query: string;
  onQuery: (q: string) => void;
  account?: Account | null;
  cliStatus: CliStatus | null;
  onOpenCliStatus: () => void;
  canSpawn: boolean;
}) {
  // One timestamp per render for the relative-time labels; the 3s background re-sync re-renders.
  const now = Date.now();
  // The account gauges only need second granularity for their reset countdowns. Floor the clock so a
  // burst of filter keystrokes (which re-render this rail) doesn't re-tick the memoized RailPanel.
  const accountClock = Math.floor(now / 1000) * 1000;
  const { active, ended } = useMemo(
    () => railSections(sessions, query),
    [sessions, query],
  );
  // Only Ended collapses — it's the archive. Active is your live work and stays open. An active filter
  // force-expands Ended so a match can't hide inside it.
  const [endedCollapsed, setEndedCollapsed] = useState(true);
  const filtering = query.trim() !== "";
  const endedOpen = filtering || !endedCollapsed;
  return (
    <aside className="flex w-[332px] shrink-0 flex-col border-r border-ink-800 bg-ink-925">
      <RailPanel
        account={account ?? null}
        now={accountClock}
        selectedId={selectedId}
        onSelect={onSelect}
      />
      <RailCliStatus status={cliStatus} onOpenCliStatus={onOpenCliStatus} />
      {/* One divider splits the identity/status zone from the session zone, drawn like every other
          section divider in the app (solid border-ink-800) rather than the old per-block dividers. */}
      <div className="shrink-0 border-t border-ink-800 p-3">
        <button
          type="button"
          onClick={onNew}
          disabled={!canSpawn}
          title={
            canSpawn
              ? undefined
              : "Claude Code CLI isn't usable — open the status panel from the CLI status band above."
          }
          className={cx(
            "inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border text-[13px] font-semibold transition-colors",
            canSpawn
              ? "border-ink-700 bg-ink-800 text-fg hover:border-ink-600 hover:bg-ink-750"
              : "cursor-not-allowed border-ink-700 bg-ink-900 text-fg-faint",
          )}
        >
          <Icon name="plus" size={14} />
          New session
        </button>
        <div className="mt-2 flex h-8 items-center gap-2 rounded-md border border-ink-700 bg-well px-2.5">
          <Icon name="search" size={14} className="shrink-0 text-fg-faint" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Filter sessions…"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg outline-none placeholder:text-fg-faint"
          />
        </div>
      </div>
      <OverlayScroll className="min-h-0 flex-1">
        {active.length === 0 && ended.length === 0 ? (
          <p className="px-4 py-5 text-[12px] text-fg-faint">
            No sessions match "{query}".
          </p>
        ) : (
          <>
            {/* Active rows carry no top padding: the filter box's p-3 already sets the gap to the
                first card, so it sits a uniform 12px below the filter, matching the px-3 sides and the
                flush Ended header that leads the list when there are no Active rows. */}
            {active.length > 0 && (
              <div className="flex flex-col gap-1.5 px-3 pb-2">
                {active.map((s) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    selected={s.id === selectedId}
                    now={now}
                    onSelect={() => onSelect(s.id)}
                  />
                ))}
              </div>
            )}
            {ended.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={
                    filtering ? undefined : () => setEndedCollapsed((v) => !v)
                  }
                  disabled={filtering}
                  aria-expanded={endedOpen}
                  className="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-ink-850 bg-ink-900 px-3.5 py-1.5 text-left transition-colors enabled:hover:bg-ink-850"
                >
                  <Icon
                    name="chevron-right"
                    size={12}
                    className={cx(
                      "shrink-0 text-fg-faint transition-transform",
                      endedOpen && "rotate-90",
                    )}
                  />
                  <Dot state="ended" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
                    {STATE_META.ended.label}
                  </span>
                  <span className="font-mono text-[10px] text-fg-faint">
                    {ended.length}
                  </span>
                </button>
                {endedOpen && (
                  <div className="flex flex-col gap-1.5 px-3 py-2">
                    {ended.map((s) => (
                      <SessionRow
                        key={s.id}
                        session={s}
                        selected={s.id === selectedId}
                        now={now}
                        onSelect={() => onSelect(s.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </OverlayScroll>
    </aside>
  );
}

function SessionRow({
  session: s,
  selected,
  now,
  onSelect,
}: {
  session: Session;
  selected: boolean;
  now: number;
  onSelect: () => void;
}) {
  const waiting = s.state === "waiting";
  const projectLine = s.branch ? `${s.project} · ${s.branch}` : s.project;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Open ${s.title}`}
      className={cx(
        "block w-full rounded-lg border p-2.5 text-left transition-colors",
        selected
          ? "border-primary/50 bg-primary/[0.06]"
          : "border-ink-800 bg-ink-900 hover:border-ink-700",
      )}
    >
      <div className="flex items-center gap-[9px]">
        <SessionTile state={s.state} management={s.management} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cx(
                "min-w-0 flex-1 truncate text-[13px] text-fg",
                selected ? "font-semibold" : "font-medium",
              )}
              title={s.title}
            >
              {s.title}
            </span>
            {isContextHigh(s.contextPct) && (
              <span
                className={cx(
                  "shrink-0 font-mono text-[10px] tabular-nums",
                  ctxTone(s.contextPct),
                )}
              >
                {s.contextPct}%
              </span>
            )}
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-fg-faint">
              {formatRelativeTime(s.lastActivityMs, now)}
            </span>
          </div>
          <div
            className="mt-0.5 truncate font-mono text-[10.5px] text-fg-faint"
            title={projectLine}
          >
            {projectLine}
          </div>
        </div>
      </div>
      {waiting && (
        <div
          className="mt-2 flex items-center gap-1.5 rounded-md bg-ink-950 px-2.5 py-1.5 text-[11px] text-accent-bright"
          title={s.waitingReason ?? "Waiting on you"}
        >
          <Icon
            name="triangle-alert"
            size={12}
            className="shrink-0 text-accent"
          />
          <span className="truncate">
            {s.waitingReason ?? "Waiting on you"}
          </span>
        </div>
      )}
    </button>
  );
}
