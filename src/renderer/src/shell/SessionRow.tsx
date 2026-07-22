import { MAX_SESSION_TITLE_LEN } from "@shared/title-override";
import type { Session } from "@shared/types";
import { cx, Lamp } from "../ui/atoms";
import { Icon } from "../ui/icons";
import { AgentIcon } from "../ui/agent-icons";
import { useI18n } from "../i18n";
import { useSessionMenu } from "./use-session-menu";
import { SessionMenuDropdown } from "./SessionMenuDropdown";

/**
 * The hermes single-line sidebar row: a 26px-tall strip with a state `Lamp` and the title. A
 * hover-revealed 3-dot button opens the same menu as the session header's title menu (Copy ID,
 * Rename, Resume, Fork, End, Open in), sharing its state machine via `useSessionMenu` — see
 * `SessionMenu.tsx` for the header's own trigger over the same hook. Renaming swaps this row's
 * select-button for a plain (non-button) container so the inline `<input>` never nests inside a
 * `<button>`, which HTML disallows. The relative-time stamp and context-% chip live in the right
 * sidebar's Session panel; the only extra here is the dimmed worktree hint on leaf sessions that
 * merged into their repo's folder (2026-07-09 worktree-merge spec). Trailing controls appear in
 * this order: subagent count, disclosure, then role/agent/actions. Actions replace the role badge
 * or agent in its slot while revealed, keeping every other element stationary.
 */
export function SessionRow({
  session,
  selected,
  onSelect,
  canSpawn,
  onResume,
  onFork,
  onEnd,
  onRename,
  onTogglePin,
  showAgentIcon = true,
  depth = 0,
  descendantCount = 0,
  activeDescendantCount = 0,
  childrenExpanded = false,
  onToggleChildren,
}: {
  session: Session;
  selected: boolean;
  onSelect: () => void;
  canSpawn: boolean;
  onResume: (id: string) => Promise<void>;
  onFork: (session: Session) => Promise<void>;
  onEnd: (id: string) => void;
  onRename: (id: string, title: string | null) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  showAgentIcon?: boolean;
  depth?: number;
  descendantCount?: number;
  activeDescendantCount?: number;
  childrenExpanded?: boolean;
  onToggleChildren?: () => void;
}) {
  const { t } = useI18n();
  const menu = useSessionMenu(session, canSpawn, {
    onResume,
    onFork,
    onEnd,
    onRename,
    onTogglePin,
  });
  const hasChildren = descendantCount > 0 && onToggleChildren !== undefined;
  const cappedDepth = Math.min(depth, 2);
  const rowStyle =
    cappedDepth > 0 ? { marginLeft: `${cappedDepth * 12}px` } : undefined;

  if (menu.editing) {
    return (
      <div
        style={rowStyle}
        className="flex min-h-[1.625rem] min-w-0 items-center gap-1.5 rounded-md py-0.5 pl-2 pr-2"
      >
        <span className="grid size-3.5 shrink-0 place-items-center">
          <Lamp state={session.state} management={session.management} />
        </span>
        <input
          ref={menu.renameField.inputRef}
          aria-label={t.shell.sessionMenu.renameFieldLabel}
          value={menu.renameField.value}
          maxLength={MAX_SESSION_TITLE_LEN}
          onChange={menu.renameField.onChange}
          onBlur={menu.renameField.onBlur}
          onKeyDown={menu.renameField.onKeyDown}
          className="h-5 min-w-0 flex-1 rounded-xs border border-(--ui-stroke-tertiary) bg-(--ui-control-active-background) px-1.5 text-[0.8125rem] text-fg outline-none"
        />
      </div>
    );
  }

  // The action trigger reveals on hover, keyboard focus inside the row, or while its menu is open.
  // Actions replace the role badge or agent in the same slot, keeping the disclosure stationary.
  // group-has-[:focus-visible] (not group-focus-within) means a plain click does not leave the row
  // stuck revealed.
  const reveal =
    "group-hover:pointer-events-auto group-hover:opacity-100 group-has-[:focus-visible]:pointer-events-auto group-has-[:focus-visible]:opacity-100";
  const trailingContentVisibility = menu.open
    ? "opacity-0"
    : "opacity-100 group-hover:opacity-0 group-has-[:focus-visible]:opacity-0";
  const threadKindLabel = session.threadKind
    ? t.shell.sessionRow.threadKind[session.threadKind]
    : null;
  return (
    <div
      style={rowStyle}
      className={cx(
        "group relative flex min-h-[1.625rem] min-w-0 items-center gap-1 rounded-md transition-colors duration-100 ease-out hover:transition-none",
        selected && "rounded-md bg-(--ui-row-active-background)",
        !selected && "hover:bg-(--ui-row-hover-background)",
      )}
    >
      {depth > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute -left-1.5 top-0 h-1/2 w-2 border-b border-l border-(--ui-stroke-tertiary)"
        />
      )}
      <button
        type="button"
        onClick={onSelect}
        onContextMenu={(event) => {
          event.preventDefault();
          menu.openAt(event.clientX, event.clientY);
        }}
        aria-pressed={selected}
        aria-label={t.shell.sessionRow.openSession(session.title)}
        className={cx(
          "flex min-h-[1.625rem] min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md py-0.5 pl-2 text-left",
        )}
      >
        <span className="grid size-3.5 shrink-0 place-items-center">
          <Lamp state={session.state} management={session.management} />
        </span>
        <span
          className={cx(
            "min-w-0 flex-1 truncate text-[0.8125rem] leading-none text-(--ui-text-secondary) group-hover:text-fg",
            selected && "text-fg",
          )}
          title={session.title}
        >
          {session.title}
        </span>
        {hasChildren && (
          <span
            className={cx(
              "shrink-0 text-[0.68rem] tabular-nums text-(--ui-text-quaternary)",
              activeDescendantCount > 0 && "text-primary",
            )}
            title={t.shell.sessionRow.subagentCount(
              descendantCount,
              activeDescendantCount,
            )}
          >
            {descendantCount}
          </span>
        )}
        {!hasChildren && session.worktree && (
          <span
            className={cx(
              "flex min-w-0 shrink-[2] items-center gap-1 text-[0.72rem] leading-none text-(--ui-text-quaternary)",
              "group-hover:hidden group-has-[:focus-visible]:hidden",
              menu.open && "hidden",
            )}
          >
            <Icon name="worktree" size={10} className="shrink-0" />
            <span className="truncate">{session.worktree.name}</span>
          </span>
        )}
      </button>
      {hasChildren && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleChildren();
          }}
          aria-expanded={childrenExpanded}
          aria-label={
            childrenExpanded
              ? t.shell.sessionRow.collapseSubagents(descendantCount)
              : t.shell.sessionRow.expandSubagents(descendantCount)
          }
          className="grid size-5 shrink-0 cursor-pointer place-items-center rounded-sm text-(--ui-text-quaternary) hover:bg-(--ui-control-hover-background) hover:text-fg"
        >
          <Icon
            name="chevron-right"
            size={13}
            className={cx(
              "transition-transform",
              childrenExpanded && "rotate-90",
            )}
          />
        </button>
      )}
      <div
        ref={menu.rootRef}
        className={cx(
          "relative mr-1 flex h-5 shrink-0 items-center justify-end",
          !threadKindLabel && "w-5",
        )}
      >
        {threadKindLabel ? (
          <span
            className={cx(
              "shrink-0 rounded-sm bg-(--ui-control-active-background) px-1 py-0.5 text-[0.625rem] leading-none text-(--ui-text-quaternary) transition-opacity duration-100",
              trailingContentVisibility,
            )}
            title={threadKindLabel}
          >
            {threadKindLabel}
          </span>
        ) : (
          showAgentIcon && (
            <span
              aria-hidden
              className={cx(
                "pointer-events-none grid size-5 place-items-center transition-opacity duration-100",
                trailingContentVisibility,
              )}
            >
              <AgentIcon agent={session.agent} size={13} />
            </span>
          )
        )}
        <button
          type="button"
          onClick={() => menu.toggleMenu()}
          aria-label={t.shell.sessionRow.sessionActions}
          aria-expanded={menu.open}
          aria-haspopup="menu"
          className={cx(
            "pointer-events-none absolute right-0 top-0 grid size-5 cursor-pointer place-items-center rounded-sm text-(--ui-text-quaternary) opacity-0 transition-opacity duration-100 ease-out hover:bg-(--ui-control-hover-background) hover:text-fg focus-visible:pointer-events-auto focus-visible:opacity-100",
            reveal,
            menu.open &&
              "pointer-events-auto opacity-100 bg-(--ui-control-active-background) text-fg",
          )}
        >
          <Icon name="ellipsis" size={13} />
        </button>
      </div>
      <SessionMenuDropdown session={session} menu={menu} />
    </div>
  );
}
