import { MAX_SESSION_TITLE_LEN } from "@shared/title-override";
import type { Session } from "@shared/types";
import { cx, Lamp } from "../ui/atoms";
import { Icon } from "../ui/icons";
import { useI18n } from "../i18n";
import { ungroupedLabel } from "./session-list-model";
import { useSessionMenu } from "./use-session-menu";
import { SessionMenuDropdown } from "./SessionMenuDropdown";

/**
 * The PINNED section's enriched two-line row (2026-07-17 pinned-sessions spec, style B): lamp +
 * title with a right-aligned relative time, then a dimmed meta line — repo · branch — with a small
 * model-family chip on the right. Folder-free: a pin is a standalone shortcut, so the row carries
 * the context its folder header would have given it. Shares SessionRow's menu machinery verbatim
 * (same `useSessionMenu` hook, same dropdown, same inline-rename input swap); the relative time
 * re-renders with the overview poll, so no timer lives here.
 */
export function PinnedSessionRow({
  session,
  selected,
  onSelect,
  canSpawn,
  onAdopt,
  onFork,
  onEnd,
  onRename,
  onTogglePin,
}: {
  session: Session;
  selected: boolean;
  onSelect: () => void;
  canSpawn: boolean;
  onAdopt: (id: string) => Promise<void>;
  onFork: (session: Session) => Promise<void>;
  onEnd: (id: string) => void;
  onRename: (id: string, title: string | null) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
}) {
  const { t } = useI18n();
  const menu = useSessionMenu(session, canSpawn, {
    onAdopt,
    onFork,
    onEnd,
    onRename,
    onTogglePin,
  });
  const repo =
    session.worktree?.repoLabel ?? (session.project || ungroupedLabel());
  const branch = session.worktree?.name ?? session.branch;

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

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={t.shell.sessionRow.openSession(session.title)}
        className={cx(
          "flex w-full min-w-0 cursor-pointer flex-col gap-1 rounded-md px-2 py-1 text-left transition-colors duration-100 ease-out hover:transition-none",
          selected
            ? "bg-(--ui-row-active-background)"
            : "hover:bg-(--ui-row-hover-background)",
        )}
      >
        <span className="flex w-full min-w-0 items-center gap-1.5">
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
          <span className="shrink-0 text-[0.68rem] leading-none text-(--ui-text-quaternary)">
            {t.time.ago(session.lastActivityMs, Date.now())}
          </span>
        </span>
        <span className="flex w-full min-w-0 items-center gap-1 pl-5 text-[0.72rem] leading-none text-(--ui-text-quaternary)">
          <span className="min-w-0 truncate">{repo}</span>
          {branch && (
            <>
              <Icon name="git-branch" size={10} className="ml-0.5 shrink-0" />
              <span className="min-w-0 shrink-[2] truncate">{branch}</span>
            </>
          )}
          <span className="ml-auto shrink-0 rounded-sm border border-(--ui-stroke-tertiary) px-1 py-px text-[0.6rem] leading-none text-(--ui-text-tertiary)">
            {session.model}
          </span>
        </span>
      </button>
      {/* Fade so the 3-dot button doesn't land on abruptly-truncated text on hover. */}
      <span
        aria-hidden
        className={cx(
          "pointer-events-none absolute right-0.5 top-0 bottom-0 w-8 rounded-r-md bg-linear-to-l to-transparent opacity-0 transition-opacity duration-100 ease-out group-hover:opacity-100",
          selected
            ? "from-(--ui-row-active-background)"
            : "from-(--ui-row-hover-background)",
        )}
      />
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
            "grid size-5 cursor-pointer place-items-center rounded-sm text-(--ui-text-quaternary) opacity-0 transition-opacity duration-100 ease-out hover:bg-(--ui-control-hover-background) hover:text-fg focus-visible:opacity-100 group-hover:opacity-100",
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
