import { useState } from "react";
import type { Session } from "@shared/types";
import { cx } from "../ui/atoms";
import { Icon } from "../ui/icons";
import { useI18n } from "../i18n";
import {
  filterGroupsActive,
  filterSessions,
  groupSessionsByProject,
  pinnedSessions,
} from "./session-list-model";
import { SessionRow } from "./SessionRow";
import { PinnedSessionRow } from "./PinnedSessionRow";
import { OVERVIEW_ID } from "../stats/sentinel";
import { SETTINGS_ID } from "../settings/sentinel";
import { SidebarPanelLabel } from "./SidebarPanelLabel";
import { OverlayScroll } from "../ui/OverlayScroll";

const ACTIVE_ONLY_KEY = "cbw.sessionsActiveOnly.v1";

/** Reads the persisted active-only flag; missing, malformed, or unreadable → false. */
function loadActiveOnly(): boolean {
  try {
    return window.localStorage.getItem(ACTIVE_ONLY_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * The left sidebar's content (design spec §4): an empty draggable top strip — the traffic lights
 * and the fixed left toggle cluster float over it — a 3-row menu (New session / Stats / Settings),
 * a search box, and the compact session list. Renders as plain content — the caller slots it
 * inside a `Pane` (Task 11), so this owns no width/position of its own beyond filling its parent.
 */
export function LeftSidebar({
  sessions,
  homeDir,
  selectedId,
  onSelect,
  onNew,
  onQuickAdd,
  canSpawn,
  onResume,
  onFork,
  onEnd,
  onRename,
  onTogglePin,
  updatePending,
  route,
  onRoute,
}: {
  sessions: Session[];
  /** For ~-abbreviating group hints; '' before the first overview lands (hints then show raw parents). */
  homeDir: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  /** Folder quick-add: spawns a session in `cwd` with the default model. Never rejects —
   *  App surfaces failures in the New session view — so this only gates the busy mark. */
  onQuickAdd: (cwd: string) => Promise<void>;
  canSpawn: boolean;
  onResume: (id: string) => Promise<void>;
  onFork: (session: Session) => Promise<void>;
  onEnd: (id: string) => void;
  onRename: (id: string, title: string | null) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  /** True while a software update is pending (available/downloading/downloaded) —
   *  badges the Settings gear (design spec 2026-07-09-update-dot). */
  updatePending: boolean;
  route: string;
  onRoute: (id: string) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  // Folders expanded by a direct click, as opposed to the expand-all button: only these show the
  // per-folder "No active sessions." line when the active filter empties them (2026-07-17 spec §3
  // — expand-all must not flood the list with empty-state lines).
  const [manuallyExpanded, setManuallyExpanded] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [activeOnly, setActiveOnly] = useState(loadActiveOnly);
  const searched = filterSessions(sessions, query);
  const pinned = pinnedSessions(searched);
  // Search decides which folders exist; the active filter then narrows rows INSIDE the groups so
  // a folder with only ended sessions still renders (2026-07-17 spec §3). Grouping before the
  // filter also keeps folder order derived from all matched sessions — toggling never reshuffles.
  const allGroups = groupSessionsByProject(searched, homeDir);
  const groups = activeOnly ? filterGroupsActive(allGroups) : allGroups;
  const allCollapsed =
    groups.length > 0 && groups.every((g) => collapsed.has(g.key));
  const toggleActiveOnly = () => {
    const next = !activeOnly;
    try {
      window.localStorage.setItem(ACTIVE_ONLY_KEY, String(next));
    } catch {
      // Storage failures are nonfatal — the toggle still works for this run.
    }
    setActiveOnly(next);
  };
  const toggleGroup = (key: string) => {
    const expanding = collapsed.has(key);
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setManuallyExpanded((prev) => {
      const next = new Set(prev);
      if (expanding) next.add(key);
      else next.delete(key);
      return next;
    });
  };
  const [quickAdding, setQuickAdding] = useState<ReadonlySet<string>>(
    new Set(),
  );
  // Expand up front so the optimistic draft row lands somewhere visible; the busy mark
  // guards a double-click from spawning twice.
  const quickAdd = async (key: string, cwd: string) => {
    if (quickAdding.has(key)) return;
    setQuickAdding((prev) => new Set(prev).add(key));
    setCollapsed((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    try {
      await onQuickAdd(cwd);
    } finally {
      setQuickAdding((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

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
          title={canSpawn ? undefined : t.settings.cli.unavailableReason}
          className={cx(
            "flex h-7 w-full items-center justify-start gap-2 rounded-md border border-transparent px-2 text-left text-[0.8125rem] font-medium transition-colors duration-100 ease-out hover:transition-none",
            canSpawn
              ? "text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-fg"
              : "cursor-not-allowed text-(--ui-text-quaternary)",
          )}
        >
          <Icon name="rocket" size={16} className="shrink-0 opacity-70" />
          {t.shell.sidebar.newSession}
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
          {t.shell.sidebar.stats}
        </button>
        <button
          type="button"
          onClick={() => onRoute(SETTINGS_ID)}
          aria-pressed={route === SETTINGS_ID}
          title={updatePending ? t.shell.sidebar.updatePendingTitle : undefined}
          className={cx(
            "flex h-7 w-full items-center justify-start gap-2 rounded-md border border-transparent px-2 text-left text-[0.8125rem] font-medium transition-colors duration-100 ease-out hover:transition-none",
            route === SETTINGS_ID
              ? "border-(--ui-stroke-tertiary) bg-(--ui-control-active-background) text-fg"
              : "text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-fg",
          )}
        >
          <span className="relative grid shrink-0 place-items-center">
            <Icon name="settings" size={16} className="opacity-70" />
            {updatePending && (
              // Ring stays the sidebar surface even on row hover/active — accepted halo (spec §UI).
              <span
                aria-hidden
                className="absolute -right-[3px] -top-[2px] size-[7px] rounded-full border-[1.5px] border-(--ui-sidebar-surface-background) bg-accent"
              />
            )}
          </span>
          {t.settings.nav.settings}
          {updatePending && (
            <span className="sr-only">
              {t.shell.sidebar.updatePendingSrOnly}
            </span>
          )}
        </button>
      </div>

      {/* Hermes SearchField chrome (borderless, underline on focus, ghost clear button), but
          full-width by maintainer preference — hermes hugs the text via field-sizing:content;
          here the input flexes so the clear button stays pinned at the row's end. px-4.5 =
          hermes's px-2 wrapper INSIDE SidebarContent's px-2.5 (10+8px) — we flattened that
          outer container, so the wrapper carries both, keeping the icon flush with the nav
          icons above. */}
      <div className="shrink-0 px-4.5 pb-1 pt-1">
        <div className="flex w-full items-center gap-1.5 border-b border-transparent transition-colors focus-within:border-(--ui-stroke-secondary)">
          <Icon
            name="search"
            size={14}
            className="pointer-events-none shrink-0 text-(--ui-text-tertiary)/70"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.shell.sidebar.searchPlaceholder}
            aria-label={t.shell.sidebar.searchLabel}
            className="h-7 min-w-0 flex-1 bg-transparent text-[0.8125rem] text-fg placeholder:text-(--ui-text-tertiary) focus:outline-none"
          />
          {query && (
            <button
              type="button"
              aria-label={t.shell.sidebar.clearSearch}
              onClick={() => setQuery("")}
              className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-(--ui-text-tertiary)/85 transition-colors duration-100 ease-out hover:bg-(--ui-control-hover-background) hover:text-fg hover:transition-none"
            >
              <Icon name="x" size={16} />
            </button>
          )}
        </div>
      </div>

      <OverlayScroll className="min-h-0 flex-1" contentClassName="pb-2">
        <div>
          <div className="sticky top-0 z-10 flex items-center bg-(--ui-sidebar-surface-background) px-2.5 pb-1 pt-1.5">
            <SidebarPanelLabel className="pl-2">
              {t.shell.sidebar.pinnedLabel}
            </SidebarPanelLabel>
          </div>
          {pinned.length === 0 ? (
            <div className="px-2.5">
              <p className="px-2 py-1 text-xs text-(--ui-text-quaternary)">
                {t.shell.sidebar.noPinnedSessions}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-px px-2.5">
              {pinned.map((s) => (
                <PinnedSessionRow
                  key={s.id}
                  session={s}
                  selected={s.id === selectedId}
                  onSelect={() => onSelect(s.id)}
                  canSpawn={canSpawn}
                  onResume={onResume}
                  onFork={onFork}
                  onEnd={onEnd}
                  onRename={onRename}
                  onTogglePin={onTogglePin}
                />
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="sticky top-0 z-10 flex items-center justify-between gap-1 bg-(--ui-sidebar-surface-background) px-2.5 pb-1 pt-1.5">
            <SidebarPanelLabel className="pl-2">
              {t.shell.sidebar.sessionsLabel}
            </SidebarPanelLabel>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => {
                  if (allCollapsed) {
                    // Expand-all is NOT a manual expand: empty folders open silently, no empty-state line.
                    setCollapsed(new Set());
                  } else {
                    setCollapsed(new Set(groups.map((g) => g.key)));
                    setManuallyExpanded(new Set());
                  }
                }}
                title={
                  allCollapsed
                    ? t.shell.sidebar.expandAll
                    : t.shell.sidebar.collapseAll
                }
                className="grid size-5 cursor-pointer place-items-center rounded-sm border border-transparent text-(--ui-text-quaternary) transition-colors duration-100 ease-out hover:bg-(--ui-control-hover-background) hover:text-fg hover:transition-none"
              >
                <Icon
                  name={allCollapsed ? "chevrons-up-down" : "chevrons-down-up"}
                  size={12}
                />
              </button>
              <button
                type="button"
                onClick={toggleActiveOnly}
                aria-pressed={activeOnly}
                title={
                  activeOnly
                    ? t.shell.sidebar.showAllSessions
                    : t.shell.sidebar.showActiveOnly
                }
                className={cx(
                  "grid size-5 cursor-pointer place-items-center rounded-sm border transition-colors duration-100 ease-out hover:transition-none",
                  activeOnly
                    ? "border-(--ui-stroke-tertiary) bg-(--ui-control-active-background) text-fg"
                    : "border-transparent text-(--ui-text-quaternary) hover:bg-(--ui-control-hover-background) hover:text-fg",
                )}
              >
                <Icon name="filter" size={12} />
              </button>
            </div>
          </div>
          <div className="px-2.5">
            {groups.length === 0 ? (
              <p className="px-2 py-2 text-xs text-(--ui-text-quaternary)">
                {activeOnly && sessions.length > 0
                  ? t.shell.sidebar.noActiveSessions
                  : t.shell.sidebar.noSessionsYet}
              </p>
            ) : (
              <div className="flex flex-col gap-px">
                {groups.map((g) => {
                  const cwd = g.cwd;
                  return (
                    <div key={g.key}>
                      <div className="group/project relative rounded-md transition-colors duration-100 ease-out hover:bg-(--ui-row-hover-background) hover:transition-none">
                        <button
                          type="button"
                          onClick={() => toggleGroup(g.key)}
                          aria-expanded={!collapsed.has(g.key)}
                          // When the CLI is down the "+" is pointer-events-none, so a hover over it lands
                          // here instead — carry its reason so that affordance survives (spec §4).
                          title={
                            cwd && !canSpawn
                              ? t.settings.cli.unavailableReason
                              : cwd
                          }
                          className="flex min-h-[1.625rem] w-full cursor-pointer items-center gap-1.5 rounded-md py-0.5 pl-2 pr-1 text-left"
                        >
                          <span className="grid size-3.5 shrink-0 place-items-center text-(--ui-text-tertiary)">
                            <Icon
                              name={
                                collapsed.has(g.key) ? "folder" : "folder-open"
                              }
                              size={14}
                            />
                          </span>
                          <span className="min-w-0 truncate text-[0.8125rem] leading-none text-(--ui-text-tertiary) group-hover/project:text-fg">
                            {g.label}
                          </span>
                          {g.hint && (
                            <span className="min-w-0 shrink-[2] truncate text-[0.72rem] leading-none text-(--ui-text-quaternary)">
                              {g.hint}
                            </span>
                          )}
                          <span className="ml-auto grid size-3.5 shrink-0 place-items-center text-(--ui-text-quaternary)">
                            <Icon
                              name="chevron-right"
                              size={13}
                              className={cx(
                                "transition-transform",
                                !collapsed.has(g.key) && "rotate-90",
                              )}
                            />
                          </span>
                        </button>
                        {cwd && (
                          <button
                            type="button"
                            onClick={() => void quickAdd(g.key, cwd)}
                            disabled={!canSpawn || quickAdding.has(g.key)}
                            aria-label={t.shell.sidebar.newSessionIn(cwd)}
                            title={
                              canSpawn
                                ? t.shell.sidebar.newSessionIn(cwd)
                                : t.settings.cli.unavailableReason
                            }
                            className={cx(
                              "absolute right-5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-sm opacity-0 transition-opacity duration-100 ease-out focus-visible:opacity-100 group-hover/project:opacity-100",
                              canSpawn && !quickAdding.has(g.key)
                                ? "cursor-pointer text-(--ui-text-quaternary) hover:bg-(--ui-control-hover-background) hover:text-fg"
                                : !canSpawn
                                  ? // CLI unusable: pass the click through to the collapse toggle beneath
                                    // (which carries the reason in its title) so the disabled "+" doesn't
                                    // dead-zone its ~20px strip.
                                    "pointer-events-none text-(--ui-text-quaternary)/50"
                                  : // Quick-add in flight (transient): keep the click inert so it can't
                                    // re-collapse the group we just expanded for the incoming draft row.
                                    "cursor-not-allowed text-(--ui-text-quaternary)/50",
                            )}
                          >
                            <Icon name="plus" size={13} />
                          </button>
                        )}
                      </div>
                      {!collapsed.has(g.key) &&
                        (g.sessions.length === 0 ? (
                          manuallyExpanded.has(g.key) && (
                            <p className="px-2 py-1 pb-2 text-xs text-(--ui-text-quaternary)">
                              {t.shell.sidebar.noActiveSessions}
                            </p>
                          )
                        ) : (
                          <div className="flex flex-col gap-px pb-1">
                            {g.sessions.map((s) => (
                              <SessionRow
                                key={s.id}
                                session={s}
                                selected={s.id === selectedId}
                                onSelect={() => onSelect(s.id)}
                                canSpawn={canSpawn}
                                onResume={onResume}
                                onFork={onFork}
                                onEnd={onEnd}
                                onRename={onRename}
                                onTogglePin={onTogglePin}
                              />
                            ))}
                          </div>
                        ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </OverlayScroll>
    </div>
  );
}
