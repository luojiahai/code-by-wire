import { MAX_SESSION_TITLE_LEN } from "@shared/title-override";
import type { Session } from "@shared/types";
import { cx } from "../ui/atoms";
import { Icon } from "../ui/icons";
import { useI18n } from "../i18n";
import { useSessionMenu } from "./use-session-menu";
import { SessionMenuDropdown } from "./SessionMenuDropdown";

/**
 * The middle header's session-name dropdown (design spec §5): title + chevron trigger; clicking it
 * toggles the shared dropdown from `useSessionMenu`/`SessionMenuDropdown`. `Rename` swaps this trigger
 * for an inline input (closing the dropdown first, so the two never show at once).
 */
export function SessionMenu({
  session,
  canSpawn,
  onResume,
  onFork,
  onEnd,
  onRename,
  onTogglePin,
}: {
  session: Session;
  /** Whether the Claude Code CLI is usable; Resume and Fork both resume by spawning it. */
  canSpawn: boolean;
  onResume: (id: string) => Promise<void>;
  onFork: (session: Session) => Promise<void>;
  /** End the running Managed session (kills the pty we own). */
  onEnd: (id: string) => void;
  /** Persist a display-name override for this session (null/empty clears it). */
  onRename: (id: string, title: string | null) => void;
  /** Persist (or clear) the pin mark for this session. */
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
  const { open, toggleMenu, rootRef, menuId, editing, renameField } = menu;

  if (editing) {
    return (
      <input
        ref={renameField.inputRef}
        aria-label={t.shell.sessionMenu.renameFieldLabel}
        value={renameField.value}
        maxLength={MAX_SESSION_TITLE_LEN}
        onChange={renameField.onChange}
        onBlur={renameField.onBlur}
        onKeyDown={renameField.onKeyDown}
        className="no-drag h-6 w-72 max-w-full rounded-xs border border-(--ui-stroke-tertiary) bg-(--ui-control-active-background) px-2 text-[0.75rem] font-medium text-fg outline-none"
      />
    );
  }

  return (
    <div ref={rootRef} className="no-drag relative min-w-0">
      <button
        type="button"
        onClick={toggleMenu}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        title={t.shell.sessionMenu.menuTitle}
        className="flex h-6 min-w-0 max-w-full items-center gap-1 overflow-hidden rounded-xs border border-transparent bg-transparent px-2 py-0 text-left text-(--ui-text-secondary) transition-colors duration-100 hover:border-(--ui-stroke-tertiary) hover:bg-(--ui-control-hover-background) hover:text-fg hover:transition-none aria-expanded:border-(--ui-stroke-tertiary) aria-expanded:bg-(--ui-control-active-background)"
      >
        <span className="min-w-0 truncate text-[0.75rem] font-medium leading-none">
          {session.title}
        </span>
        <Icon
          name="chevron-down"
          size={13}
          className={cx(
            "shrink-0 text-(--ui-text-tertiary) transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      <SessionMenuDropdown session={session} menu={menu} />
    </div>
  );
}
