import { useState } from "react";
import type { Session } from "@shared/types";
import { cx } from "../ui/atoms";
import { Icon } from "../ui/icons";
import { filterSessions, groupSessionsByProject } from "./session-list-model";
import { SessionRow } from "./SessionRow";
import { OVERVIEW_ID } from "../stats/sentinel";
import { SETTINGS_ID } from "../settings/sentinel";
import { SidebarPanelLabel } from "./SidebarPanelLabel";

/**
 * The left sidebar's content (design spec §4): an empty draggable top strip — the traffic lights
 * and the fixed left toggle cluster float over it — a 3-row menu (New session / Stats / Settings),
 * a search box, and the compact session list. Renders as plain content — the caller slots it
 * inside a `Pane` (Task 11), so this owns no width/position of its own beyond filling its parent.
 */
export function LeftSidebar({
  sessions,
  selectedId,
  onSelect,
  onNew,
  canSpawn,
  route,
  onRoute,
}: {
  sessions: Session[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  canSpawn: boolean;
  route: string;
  onRoute: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  // One timestamp per render for the relative-time labels; the 3s background re-sync (App.tsx's
  // polling loop) re-renders this list, so the clock stays close enough without its own timer.
  const now = Date.now();
  const groups = groupSessionsByProject(filterSessions(sessions, query));
  const toggleGroup = (project: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(project)) next.delete(project);
      else next.add(project);
      return next;
    });

  return (
    <div className="flex h-full flex-col border-r border-sidebar-border bg-(--ui-sidebar-surface-background)">
      <div
        className="drag-region shrink-0 select-none"
        style={{ height: "var(--titlebar-height)" }}
      />

      <div className="flex shrink-0 flex-col gap-px px-2.5 pb-2 pt-1.5">
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
            "flex h-7 w-full items-center justify-start gap-2 rounded-md border border-transparent px-2 text-left text-[0.8125rem] font-medium transition-colors duration-100 ease-out hover:transition-none",
            canSpawn
              ? "text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-fg"
              : "cursor-not-allowed text-(--ui-text-quaternary)",
          )}
        >
          <Icon name="plus" size={16} className="shrink-0 opacity-70" />
          New session
        </button>
        <button
          type="button"
          onClick={() => onRoute(OVERVIEW_ID)}
          aria-pressed={route === OVERVIEW_ID}
          className={cx(
            "flex h-7 w-full items-center justify-start gap-2 rounded-md border border-transparent px-2 text-left text-[0.8125rem] font-medium transition-colors duration-100 ease-out hover:transition-none",
            route === OVERVIEW_ID
              ? "border-(--ui-stroke-tertiary) bg-(--ui-control-active-background) text-fg"
              : "text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-fg",
          )}
        >
          <Icon name="chart-column" size={16} className="shrink-0 opacity-70" />
          Stats
        </button>
        <button
          type="button"
          onClick={() => onRoute(SETTINGS_ID)}
          aria-pressed={route === SETTINGS_ID}
          className={cx(
            "flex h-7 w-full items-center justify-start gap-2 rounded-md border border-transparent px-2 text-left text-[0.8125rem] font-medium transition-colors duration-100 ease-out hover:transition-none",
            route === SETTINGS_ID
              ? "border-(--ui-stroke-tertiary) bg-(--ui-control-active-background) text-fg"
              : "text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-fg",
          )}
        >
          <Icon name="settings" size={16} className="shrink-0 opacity-70" />
          Settings
        </button>
      </div>

      {/* Hermes SearchField chrome (borderless, underline on focus, ghost clear button), but
          full-width by maintainer preference — hermes hugs the text via field-sizing:content;
          here the input flexes so the clear button stays pinned at the row's end. px-4.5 =
          hermes's px-2 wrapper INSIDE SidebarContent's px-2.5 (10+8px) — we flattened that
          outer container, so the wrapper carries both, keeping the icon flush with the nav
          icons above. */}
      <div className="shrink-0 px-4.5 pb-1 pt-1">
        <div className="flex w-full items-center gap-1.5 border-b border-transparent px-0.5 transition-colors focus-within:border-(--ui-stroke-secondary)">
          <Icon
            name="search"
            size={14}
            className="pointer-events-none shrink-0 text-(--ui-text-tertiary)/70"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sessions…"
            aria-label="Search sessions"
            className="h-7 min-w-0 flex-1 bg-transparent text-[0.8125rem] text-fg placeholder:text-(--ui-text-tertiary) focus:outline-none"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[4px] text-(--ui-text-tertiary)/85 transition-colors duration-100 ease-out hover:bg-(--ui-control-hover-background) hover:text-fg hover:transition-none"
            >
              <Icon name="x" size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-1 px-2.5 pb-1 pt-1.5">
        <SidebarPanelLabel className="pl-2">Sessions</SidebarPanelLabel>
        <span className="text-[0.6875rem] font-medium leading-none text-(--ui-text-quaternary)">
          {groups.reduce((n, g) => n + g.sessions.length, 0)}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2">
        {groups.length === 0 ? (
          <p className="px-2 py-2 text-xs text-(--ui-text-quaternary)">
            No sessions yet.
          </p>
        ) : (
          <div className="flex flex-col gap-px">
            {groups.map((g) => (
              <div key={g.project}>
                <button
                  type="button"
                  onClick={() => toggleGroup(g.project)}
                  aria-expanded={!collapsed.has(g.project)}
                  className="group/project flex min-h-[1.625rem] w-full cursor-pointer items-center gap-1.5 rounded-md py-0.5 pl-2 pr-1 text-left transition-colors duration-100 ease-out hover:bg-(--ui-row-hover-background) hover:transition-none"
                >
                  <span className="grid size-3.5 shrink-0 place-items-center text-(--ui-text-tertiary)">
                    <Icon
                      name="chevron-right"
                      size={13}
                      className={cx(
                        "transition-transform",
                        !collapsed.has(g.project) && "rotate-90",
                      )}
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[0.8125rem] leading-none text-(--ui-text-tertiary) group-hover/project:text-fg">
                    {g.project}
                  </span>
                  <span className="shrink-0 text-[0.6875rem] font-medium leading-none text-(--ui-text-quaternary)">
                    {g.sessions.length}
                  </span>
                </button>
                {!collapsed.has(g.project) && (
                  <div className="flex flex-col gap-px pb-1 pl-4">
                    {g.sessions.map((s) => (
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
