import { MAX_SESSION_TITLE_LEN } from "@shared/title-override";
import type { Session } from "@shared/types";
import { cx, Lamp } from "../ui/atoms";
import { Icon } from "../ui/icons";
import { AgentIcon } from "../ui/agent-icons";
import { AGENTS } from "@shared/agents";
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
 * sidebar's Session panel; the only extra here is the dimmed worktree hint on sessions that merged
 * into their repo's folder (2026-07-09 worktree-merge spec). On reveal (hover, keyboard focus
 * inside the row, or an open menu) the hint hides and the row gains right padding instead of the
 * trigger being masked over it, so right-aligned content vacates rather than getting painted under
 * the button.
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
}) {
  const { t } = useI18n();
  const menu = useSessionMenu(session, canSpawn, {
    onResume,
    onFork,
    onEnd,
    onRename,
    onTogglePin,
  });

  if (menu.editing) {
    return (
      <div className="flex min-h-[1.625rem] min-w-0 items-center gap-1.5 rounded-md py-0.5 pl-2 pr-2">
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

  // The trigger reveals on hover, keyboard focus inside the row, or while its menu is open. The
  // same `revealed` condition hides the worktree hint and pads the row's right edge, so the
  // content underneath vacates instead of being masked — overlap is structurally impossible and
  // the old fade gradient (with its corner-seam artifact) is gone. group-has-[:focus-visible]
  // (not group-focus-within) so a plain click doesn't leave the row stuck revealed.
  const reveal =
    "group-hover:opacity-100 group-has-[:focus-visible]:opacity-100";
  return (
    <div className="group relative">
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
          "flex min-h-[1.625rem] w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md py-0.5 pl-2 pr-2 text-left transition-colors duration-100 ease-out hover:transition-none",
          "group-hover:pr-7 group-has-[:focus-visible]:pr-7",
          menu.open && "pr-7",
          selected
            ? "bg-(--ui-row-active-background)"
            : "hover:bg-(--ui-row-hover-background)",
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
        {session.worktree && (
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
        <span
          className="grid size-3.5 shrink-0 place-items-center text-(--ui-text-quaternary)"
          title={AGENTS[session.agent].label}
        >
          <AgentIcon agent={session.agent} size={13} />
        </span>
      </button>
      <div
        ref={menu.rootRef}
        className="absolute right-1 top-1/2 -translate-y-1/2"
      >
        <button
          type="button"
          onClick={() => menu.toggleMenu()}
          aria-label={t.shell.sessionRow.sessionActions}
          aria-expanded={menu.open}
          aria-haspopup="menu"
          className={cx(
            "grid size-5 cursor-pointer place-items-center rounded-sm text-(--ui-text-quaternary) opacity-0 transition-opacity duration-100 ease-out hover:bg-(--ui-control-hover-background) hover:text-fg focus-visible:opacity-100",
            reveal,
            menu.open &&
              "opacity-100 bg-(--ui-control-active-background) text-fg",
          )}
        >
          <Icon name="ellipsis" size={13} />
        </button>
      </div>
      <SessionMenuDropdown session={session} menu={menu} />
    </div>
  );
}
