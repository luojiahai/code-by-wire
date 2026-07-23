import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { Session } from "@shared/types";
import type { ProjectPlacement, ProjectState } from "@shared/ipc";
import { AGENT_IDS, AGENTS, type AgentId } from "@shared/agents";
import { cx } from "../ui/atoms";
import { Icon } from "../ui/icons";
import { AgentIcon } from "../ui/agent-icons";
import { useI18n } from "../i18n";
import {
  filterGroups,
  filterSessions,
  groupSessionsByProject,
  partitionProjectGroups,
  projectGroupsForCollapse,
  isSessionFamilyCollapsed,
  sessionForest,
  toggleProjectGroups,
  pinnedSessions,
  type SessionTreeNode,
} from "./session-list-model";
import { SessionRow } from "./SessionRow";
import { PinnedSessionRow } from "./PinnedSessionRow";
import { OVERVIEW_ID } from "../stats/sentinel";
import { SETTINGS_ID } from "../settings/sentinel";
import { SidebarPanelLabel } from "./SidebarPanelLabel";
import { OverlayScroll } from "../ui/OverlayScroll";
import {
  loadSessionsListPreferences,
  saveSessionsListPreferences,
  type SessionsListPreferences,
} from "./session-list-preferences";
import { SessionFilterMenu } from "./SessionFilterMenu";
import { ProjectGroupRow } from "./ProjectGroupRow";
import { placeAnchoredMenu } from "./anchored-menu-position";

/**
 * The left sidebar's content (design spec §4): an empty draggable top strip — the traffic lights
 * and the fixed left toggle cluster float over it — a 3-row menu (New session / Stats / Settings),
 * a search box, and the compact session list. Renders as plain content — the caller slots it
 * inside a `Pane` (Task 11), so this owns no width/position of its own beyond filling its parent.
 */
export function LeftSidebar({
  sessions,
  homeDir,
  projectState,
  selectedId,
  onSelect,
  onNew,
  onQuickAdd,
  canSpawnFor,
  onResume,
  onFork,
  onEnd,
  onRename,
  onTogglePin,
  onSetProjectPlacement,
  updatePending,
  route,
  onRoute,
}: {
  sessions: Session[];
  /** For ~-abbreviating group hints; '' before the first overview lands (hints then show raw parents). */
  homeDir: string;
  projectState: ProjectState;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  /** Folder quick-add: spawns a session in `cwd` for the chosen agent with the default model.
   *  Never rejects — App surfaces failures in the New session view — so this only gates the
   *  busy mark. */
  onQuickAdd: (cwd: string, agent: AgentId) => Promise<void>;
  /** Per-agent CLI gate: rows gate their Resume/Fork on their own agent; the folder "+" and agent
   *  picker stay usable as long as ANY agent can spawn. */
  canSpawnFor: (agent: AgentId) => boolean;
  onResume: (id: string) => Promise<void>;
  onFork: (session: Session) => Promise<void>;
  onEnd: (id: string) => void;
  onRename: (id: string, title: string | null) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onSetProjectPlacement: (
    key: string,
    placement: ProjectPlacement,
  ) => Promise<void>;
  /** True while a software update is pending (available/downloading/downloaded) —
   *  badges the Settings gear (design spec 2026-07-09-update-dot). */
  updatePending: boolean;
  route: string;
  onRoute: (id: string) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  // Explicit per-parent overrides only. Families default collapsed and expand only from their
  // chevron; search and selection never change disclosure state implicitly.
  const [collapsedFamilies, setCollapsedFamilies] = useState<
    ReadonlyMap<string, boolean>
  >(new Map());
  const [hiddenCollapsed, setHiddenCollapsed] = useState(true);
  // Folders expanded by a direct click, as opposed to the expand-all button: only these show the
  // per-folder "No active sessions." line when the active filter empties them (2026-07-17 spec §3
  // — expand-all must not flood the list with empty-state lines).
  const [manuallyExpanded, setManuallyExpanded] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [preferences, setPreferences] = useState(() =>
    loadSessionsListPreferences(window.localStorage),
  );
  const updatePreferences = (next: SessionsListPreferences) => {
    setPreferences(next);
    saveSessionsListPreferences(window.localStorage, next);
  };
  const filterActive =
    preferences.visibility === "active" || preferences.agent !== "all";
  const searched = filterSessions(sessions, query);
  const pinned = pinnedSessions(searched);
  // Build families before project grouping so a child follows its root even if its own rollout cwd
  // differs. filterGroups applies search + preferences together and retains ancestor context.
  const allGroups = groupSessionsByProject(sessions, homeDir);
  const groups = filterGroups(allGroups, preferences, query);
  const {
    pinned: pinnedProjects,
    others: otherProjects,
    hidden: hiddenProjects,
  } = partitionProjectGroups(groups, projectState);
  const collapsibleGroups = projectGroupsForCollapse(
    pinnedProjects,
    otherProjects,
    hiddenProjects,
  );
  const hiddenCount = hiddenProjects.length;
  const allCollapsed =
    collapsibleGroups.length > 0 &&
    collapsibleGroups.every((g) => collapsed.has(g.key));
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
  const quickAdd = async (key: string, cwd: string, agent: AgentId) => {
    if (quickAdding.has(key)) return;
    setQuickAdding((prev) => new Set(prev).add(key));
    setCollapsed((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    try {
      await onQuickAdd(cwd, agent);
    } finally {
      setQuickAdding((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };
  // The quick-add agent menu: which folder it's open for and where (anchored under the "+").
  const [agentMenu, setAgentMenu] = useState<{
    key: string;
    cwd: string;
    left: number;
    top: number;
  } | null>(null);
  const agentMenuRef = useRef<HTMLDivElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [filterMenuPosition, setFilterMenuPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  useEffect(() => {
    if (!agentMenu) return;
    function onDown(e: MouseEvent) {
      if (!agentMenuRef.current?.contains(e.target as Node)) setAgentMenu(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAgentMenu(null);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [agentMenu]);

  useEffect(() => {
    if (!filterMenuOpen) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        !filterMenuRef.current?.contains(target) &&
        !filterTriggerRef.current?.contains(target)
      ) {
        setFilterMenuOpen(false);
        setFilterMenuPosition(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setFilterMenuOpen(false);
        setFilterMenuPosition(null);
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [filterMenuOpen]);

  useLayoutEffect(() => {
    if (!filterMenuOpen) return;
    function placeFilterMenu() {
      const trigger = filterTriggerRef.current;
      const menu = filterMenuRef.current;
      if (!trigger || !menu) return;
      const menuRect = menu.getBoundingClientRect();
      setFilterMenuPosition(
        placeAnchoredMenu(
          trigger.getBoundingClientRect(),
          { width: window.innerWidth, height: window.innerHeight },
          { width: menuRect.width, height: menuRect.height },
          "end",
        ),
      );
    }
    placeFilterMenu();
    window.addEventListener("scroll", placeFilterMenu, true);
    window.addEventListener("resize", placeFilterMenu);
    return () => {
      window.removeEventListener("scroll", placeFilterMenu, true);
      window.removeEventListener("resize", placeFilterMenu);
    };
  }, [filterMenuOpen]);
  // A folder's "+" (and the top New session button) stay usable as long as any agent can spawn.
  const anySpawnable = AGENT_IDS.some((a) => canSpawnFor(a));

  const renderSessionNode = (
    node: SessionTreeNode,
    depth: number,
  ): ReactNode => {
    const familyCollapsed = isSessionFamilyCollapsed(
      node.children.length > 0,
      collapsedFamilies.get(node.session.id),
    );
    return (
      <div key={node.session.id}>
        <SessionRow
          session={node.session}
          selected={node.session.id === selectedId}
          onSelect={() => onSelect(node.session.id)}
          canSpawn={canSpawnFor(node.session.agent)}
          onResume={onResume}
          onFork={onFork}
          onEnd={onEnd}
          onRename={onRename}
          onTogglePin={onTogglePin}
          showAgentIcon={depth === 0 && preferences.showAgentIcons}
          depth={depth}
          descendantCount={node.descendantCount}
          activeDescendantCount={node.activeDescendantCount}
          childrenExpanded={!familyCollapsed}
          onToggleChildren={
            node.children.length > 0
              ? () => {
                  setCollapsedFamilies((current) => {
                    const next = new Map(current);
                    next.set(node.session.id, !familyCollapsed);
                    return next;
                  });
                }
              : undefined
          }
        />
        {!familyCollapsed &&
          node.children.map((child) => renderSessionNode(child, depth + 1))}
      </div>
    );
  };

  const renderProjectGroup = (
    g: (typeof groups)[number],
    placement: ProjectPlacement,
  ) => {
    const cwd = g.cwd;
    return (
      <div key={g.key}>
        <ProjectGroupRow
          group={g}
          collapsed={collapsed.has(g.key)}
          placement={placement}
          quickAddDisabled={!anySpawnable}
          quickAdding={quickAdding.has(g.key)}
          unavailableReason={t.settings.cli.unavailableReason}
          newSessionLabel={cwd ? t.shell.sidebar.newSessionIn(cwd) : undefined}
          pinLabel={t.shell.sidebar.pinProject}
          unpinLabel={t.shell.sidebar.unpinProject}
          hideLabel={t.shell.sidebar.hideProject}
          unhideLabel={t.shell.sidebar.unhideProject}
          projectActionsLabel={t.shell.sidebar.projectActions}
          absolutePathLabel={t.shell.sidebar.absolutePath}
          copyPathLabel={t.shell.sidebar.copyPath}
          onToggle={() => toggleGroup(g.key)}
          onQuickAdd={(button) => {
            if (!cwd) return;
            const r = button.getBoundingClientRect();
            setAgentMenu((cur) =>
              cur?.key === g.key
                ? null
                : {
                    key: g.key,
                    cwd,
                    left: Math.min(r.left, window.innerWidth - 176 - 8),
                    top: r.bottom + 6,
                  },
            );
          }}
          onSetPlacement={(next) => onSetProjectPlacement(g.key, next)}
        />
        {!collapsed.has(g.key) &&
          (g.sessions.length === 0 ? (
            manuallyExpanded.has(g.key) && (
              <p className="px-2 py-1 pb-2 text-xs text-(--ui-text-quaternary)">
                {preferences.agent !== "all"
                  ? t.shell.sidebar.noMatchingSessions
                  : t.shell.sidebar.noActiveSessions}
              </p>
            )
          ) : (
            <div className="flex flex-col gap-px pb-1">
              {sessionForest(g.sessions).map((node) =>
                renderSessionNode(node, 0),
              )}
            </div>
          ))}
      </div>
    );
  };

  return (
    <>
      <div className="flex h-full flex-col border-r border-(--ui-stroke-secondary) bg-(--ui-sidebar-surface-background)">
        <div
          className="drag-region shrink-0 select-none"
          style={{ height: "var(--titlebar-height)" }}
        />

        <div className="flex shrink-0 flex-col gap-px px-2.5 pb-2 pt-1.5">
          <button
            type="button"
            onClick={onNew}
            disabled={!anySpawnable}
            title={anySpawnable ? undefined : t.settings.cli.unavailableReason}
            className={cx(
              "flex h-7 w-full items-center justify-start gap-2 rounded-md border border-transparent px-2 text-left text-[0.8125rem] font-medium transition-colors duration-100 ease-out hover:transition-none",
              anySpawnable
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
            <Icon
              name="chart-column"
              size={16}
              className="shrink-0 opacity-70"
            />
            {t.shell.sidebar.stats}
          </button>
          <button
            type="button"
            onClick={() => onRoute(SETTINGS_ID)}
            aria-pressed={route === SETTINGS_ID}
            title={
              updatePending ? t.shell.sidebar.updatePendingTitle : undefined
            }
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
                    canSpawn={canSpawnFor(s.agent)}
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
                    // Expand-all is NOT a manual expand: empty folders open silently, no empty-state line.
                    setCollapsed((current) =>
                      toggleProjectGroups(current, collapsibleGroups),
                    );
                    if (!allCollapsed) {
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
                    name={
                      allCollapsed ? "chevrons-up-down" : "chevrons-down-up"
                    }
                    size={12}
                  />
                </button>
                <button
                  ref={filterTriggerRef}
                  type="button"
                  onClick={() => {
                    if (filterMenuOpen) {
                      setFilterMenuOpen(false);
                      setFilterMenuPosition(null);
                      return;
                    }
                    setFilterMenuPosition(null);
                    setFilterMenuOpen(true);
                  }}
                  aria-pressed={filterActive}
                  aria-expanded={filterMenuOpen}
                  aria-haspopup="menu"
                  aria-label={t.shell.sidebar.filterMenuLabel}
                  title={t.shell.sidebar.filterMenuLabel}
                  className={cx(
                    "grid size-5 cursor-pointer place-items-center rounded-sm border transition-colors duration-100 ease-out hover:transition-none",
                    filterActive
                      ? "border-(--ui-stroke-tertiary) bg-(--ui-control-active-background) text-fg"
                      : "border-transparent text-(--ui-text-quaternary) hover:bg-(--ui-control-hover-background) hover:text-fg",
                  )}
                >
                  <Icon name="filter" size={12} />
                </button>
              </div>
            </div>
            <div className="px-2.5">
              <div className="flex flex-col gap-px">
                {pinnedProjects.length === 0 ? (
                  <p className="px-2 py-1 text-xs text-(--ui-text-quaternary)">
                    {t.shell.sidebar.noPinnedProjects}
                  </p>
                ) : (
                  pinnedProjects.map((g) => renderProjectGroup(g, "pinned"))
                )}
                <div className="mx-2 my-1 border-t border-sidebar-border" />
                {groups.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-(--ui-text-quaternary)">
                    {filterActive && sessions.length > 0
                      ? t.shell.sidebar.noMatchingSessions
                      : t.shell.sidebar.noSessionsYet}
                  </p>
                ) : (
                  otherProjects.map((g) => renderProjectGroup(g, "ordinary"))
                )}
              </div>
            </div>
          </div>
          <div className="px-2.5">
            <div className="mx-2 mt-1 border-t border-sidebar-border" />
            <button
              type="button"
              onClick={() => setHiddenCollapsed((value) => !value)}
              aria-expanded={!hiddenCollapsed}
              className="mt-1 flex h-6 w-full items-center gap-1 rounded-sm pl-2 text-(--ui-text-quaternary) hover:bg-(--ui-row-hover-background) hover:text-fg"
            >
              <span className="text-[0.64rem] font-semibold uppercase tracking-[0.12em]">
                {t.shell.sidebar.hiddenLabel}
              </span>
              <span className="rounded-full bg-(--ui-control-active-background) px-1.5 text-[0.64rem] tabular-nums">
                {hiddenCount}
              </span>
              <Icon
                name={hiddenCollapsed ? "chevron-right" : "chevron-down"}
                size={12}
              />
            </button>
            {!hiddenCollapsed && (
              <div className="flex flex-col gap-px">
                {hiddenProjects.length === 0 ? (
                  <p className="px-2 py-1 text-xs text-(--ui-text-quaternary)">
                    {t.shell.sidebar.noHiddenProjects}
                  </p>
                ) : (
                  hiddenProjects.map((g) => renderProjectGroup(g, "hidden"))
                )}
              </div>
            )}
          </div>
        </OverlayScroll>
      </div>
      {agentMenu &&
        createPortal(
          <div
            ref={agentMenuRef}
            role="menu"
            style={{
              position: "fixed",
              left: agentMenu.left,
              top: agentMenu.top,
              width: 176,
            }}
            className="z-50 rounded-lg border border-(--ui-stroke-secondary) bg-[color-mix(in_srgb,var(--ui-bg-elevated)_96%,transparent)] p-1.5 shadow-(--shadow-md) backdrop-blur-xl"
          >
            {AGENT_IDS.map((a) => (
              <button
                key={a}
                type="button"
                role="menuitem"
                disabled={!canSpawnFor(a)}
                title={
                  canSpawnFor(a)
                    ? t.shell.sidebar.newSessionWith(
                        AGENTS[a].label,
                        agentMenu.cwd,
                      )
                    : t.settings.cli.unavailableReasonFor(AGENTS[a].label)
                }
                onClick={() => {
                  const m = agentMenu;
                  setAgentMenu(null);
                  void quickAdd(m.key, m.cwd, a);
                }}
                className="flex w-full items-center gap-2.5 rounded-xs px-2 py-1.5 text-left text-xs text-fg-muted transition-colors enabled:hover:bg-(--ui-control-hover-background) enabled:hover:text-fg disabled:cursor-default disabled:opacity-40"
              >
                <AgentIcon agent={a} size={13} />
                {AGENTS[a].label}
              </button>
            ))}
          </div>,
          document.body,
        )}
      {filterMenuOpen &&
        createPortal(
          <div
            ref={filterMenuRef}
            className="z-50"
            style={{
              position: "fixed",
              left: filterMenuPosition?.left ?? 0,
              top: filterMenuPosition?.top ?? 0,
              visibility: filterMenuPosition ? "visible" : "hidden",
              maxHeight: "calc(100vh - 16px)",
              overflowY: "auto",
            }}
          >
            <SessionFilterMenu
              preferences={preferences}
              onChange={updatePreferences}
              onClose={() => {
                setFilterMenuOpen(false);
                setFilterMenuPosition(null);
              }}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
