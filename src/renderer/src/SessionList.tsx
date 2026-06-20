import { useState } from "react";
import type { Session, Account } from "@shared/types";
import { RailPanel } from "./ui/RailPanel";
import { railSections } from "@shared/overview";
import { formatRelativeTime } from "@shared/format";
import { cx, SessionTile } from "./ui/atoms";
import { OverlayScroll } from "./ui/OverlayScroll";
import { Icon } from "./ui/icons";
import { STATE_META, ctxTone, isContextHigh } from "./ui/meta";

/**
 * The master rail: a headerless Active list (every non-ended session, newest-created first) above a
 * single collapsible Ended section. Rows are real <button>s, so the list is keyboard- and
 * screen-reader-navigable. Selecting a row opens it in the detail pane to the right.
 */
export function SessionList({
  sessions,
  selectedId,
  onSelect,
  onNew,
  account,
  canSpawn,
}: {
  sessions: Session[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  account?: Account | null;
  canSpawn: boolean;
}) {
  // One timestamp per render for the relative-time labels; the 3s background re-sync re-renders.
  const now = Date.now();
  // The account gauges only need second granularity for their reset countdowns. Floor the clock so a
  // re-render doesn't re-tick the memoized RailPanel.
  const accountClock = Math.floor(now / 1000) * 1000;
  const { active, ended } = railSections(sessions, "");
  // Only Ended collapses — it's the archive. Active is your live work and stays open.
  const [endedCollapsed, setEndedCollapsed] = useState(true);
  return (
    <aside className="flex w-[332px] shrink-0 flex-col border-r border-ink-800 bg-ink-925">
      <RailPanel
        account={account ?? null}
        now={accountClock}
        selectedId={selectedId}
        onSelect={onSelect}
      />
      <div className="shrink-0 p-3">
        <button
          type="button"
          onClick={onNew}
          disabled={!canSpawn}
          title={
            canSpawn
              ? undefined
              : "Claude Code CLI isn't usable — open Sys status in the title bar."
          }
          className={cx(
            "inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border font-display text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors",
            canSpawn
              ? "border-ink-700 bg-ink-900 text-fg hover:border-ink-600 hover:bg-ink-850"
              : "cursor-not-allowed border-ink-800 bg-ink-900 text-fg-faint",
          )}
        >
          <Icon name="plus" size={14} />
          New session
        </button>
      </div>
      <OverlayScroll className="min-h-0 flex-1">
        {active.length === 0 && ended.length === 0 ? (
          <p className="px-4 py-5 text-[12px] text-fg-faint">
            No sessions yet.
          </p>
        ) : (
          <>
            {active.length > 0 && (
              <div className="flex flex-col gap-1 px-2 pb-2">
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
                  onClick={() => setEndedCollapsed((v) => !v)}
                  aria-expanded={!endedCollapsed}
                  className="sticky top-0 z-10 flex w-full items-center gap-2 border-y border-ink-850 bg-ink-925 px-3.5 py-2 text-left transition-colors hover:bg-ink-900"
                >
                  <Icon
                    name="chevron-right"
                    size={12}
                    className={cx(
                      "shrink-0 text-fg-faint transition-transform",
                      !endedCollapsed && "rotate-90",
                    )}
                  />
                  <span className="font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-faint">
                    {STATE_META.ended.label}
                  </span>
                  <span className="font-mono text-[10px] text-fg-faint">
                    · {ended.length}
                  </span>
                </button>
                {!endedCollapsed && (
                  <div className="flex flex-col gap-1 px-2 py-1.5">
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
        // Flat rows: a 2px left rail carries selection (primary when open, transparent otherwise so
        // there's no width shift), with a quiet hover fill. No bordered card boxes.
        "block w-full rounded-md border-l-2 px-2.5 py-2 text-left transition-colors",
        selected
          ? "border-l-primary bg-primary/[0.05]"
          : "border-l-transparent hover:bg-ink-900",
      )}
    >
      <div className="flex items-start gap-2.5">
        <SessionTile
          state={s.state}
          management={s.management}
          selected={selected}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className={cx(
                "min-w-0 flex-1 truncate text-[12.5px] text-fg",
                selected ? "font-semibold" : "font-medium",
              )}
              title={s.title}
            >
              {s.title}
            </span>
            <span className="shrink-0 font-mono text-[9.5px] tabular-nums text-fg-faint">
              {formatRelativeTime(s.lastActivityMs, now)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span
              className="min-w-0 flex-1 truncate font-mono text-[10px] text-fg-faint"
              title={projectLine}
            >
              {projectLine}
            </span>
            {isContextHigh(s.contextPct) && (
              <span
                className={cx(
                  "shrink-0 rounded border border-ink-700 px-1 font-mono text-[9px] tabular-nums",
                  ctxTone(s.contextPct),
                )}
              >
                {s.contextPct}%
              </span>
            )}
          </div>
        </div>
      </div>
      {waiting && (
        <div
          className="mt-2 flex items-center gap-1.5 rounded bg-ink-950 px-2 py-1.5 text-[11px] text-accent-bright"
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
