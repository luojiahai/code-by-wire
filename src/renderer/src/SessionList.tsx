import { useState } from "react";
import type { Session } from "@shared/types";
import { railSections } from "@shared/overview";
import { formatRelativeTime } from "@shared/format";
import { cx, focusRing, focusRingInset, SessionTile } from "./ui/atoms";
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
  canSpawn,
}: {
  sessions: Session[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  canSpawn: boolean;
}) {
  // One timestamp per render for the relative-time labels; the 3s background re-sync re-renders.
  const now = Date.now();
  const { active, ended } = railSections(sessions, "");
  // Only Ended collapses — it's the archive. Active is your live work and stays open.
  const [endedCollapsed, setEndedCollapsed] = useState(true);
  return (
    <aside className="flex w-[332px] shrink-0 flex-col border-r border-ink-800 bg-ink-925">
      <div className="shrink-0 p-2">
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
            "inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border font-display text-label font-semibold uppercase tracking-[0.1em] transition-colors",
            focusRing,
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
          <p className="px-4 py-5 text-aux text-fg-faint">No sessions yet.</p>
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
                  className={cx(
                    "sticky top-0 z-10 flex w-full items-center gap-2 border-y border-ink-850 bg-ink-925 px-3.5 py-2 text-left transition-colors hover:bg-ink-900",
                    focusRing,
                  )}
                >
                  <Icon
                    name="chevron-right"
                    size={12}
                    className={cx(
                      "shrink-0 text-fg-faint transition-transform",
                      !endedCollapsed && "rotate-90",
                    )}
                  />
                  <span className="font-display text-micro font-semibold uppercase tracking-[0.1em] text-fg-faint">
                    {STATE_META.ended.label}
                  </span>
                  <span className="font-mono text-label text-fg-faint">
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
        // No border. Selection is carried by the teal fill plus the brightened icon and
        // semibold title.
        "block w-full rounded-md px-2.5 py-2 text-left transition-colors",
        focusRingInset,
        selected ? "bg-primary/[0.1]" : "hover:bg-ink-900",
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
                "min-w-0 flex-1 truncate text-body text-fg",
                selected ? "font-semibold" : "font-medium",
              )}
              title={s.title}
            >
              {s.title}
            </span>
            <span className="shrink-0 font-mono text-micro tabular-nums text-fg-faint">
              {formatRelativeTime(s.lastActivityMs, now)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span
              className="min-w-0 flex-1 truncate font-mono text-label text-fg-faint"
              title={projectLine}
            >
              {projectLine}
            </span>
            {isContextHigh(s.contextPct) && (
              <span
                className={cx(
                  "shrink-0 rounded border border-ink-700 px-1 font-mono text-micro tabular-nums",
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
          className="mt-2 flex items-center gap-1.5 rounded bg-ink-950 px-2 py-1.5 text-meta text-accent-bright"
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
