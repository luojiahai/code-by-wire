import { MAX_SESSION_TITLE_LEN } from "@shared/title-override";
import type { Session } from "@shared/types";
import { cx, Lamp } from "../ui/atoms";
import { Icon } from "../ui/icons";
import { AgentIcon } from "../ui/agent-icons";
import { AGENTS } from "@shared/agents";
import { pinnedModelBadge } from "../ui/meta";
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
 * re-renders with the overview poll, so no timer lives here. The trigger is absolutely positioned
 * and vertically centered across both lines, independent of their content; on reveal (hover,
 * keyboard focus inside the row, or an open menu) the line-1 time and line-2 model chip go
 * `invisible` in place — not removed — so the trigger lands in already-reserved space without
 * reflowing either line, and the branch/worktree name (with its own tooltip) stays visible
 * throughout.
 */
export function PinnedSessionRow({
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
  const repo =
    session.worktree?.repoLabel ?? (session.project || ungroupedLabel());
  const branch = session.worktree?.name ?? session.branch;
  // The real checked-out branch, only when the row is showing a worktree *directory* name that
  // differs from it — surfaced as a tooltip so it costs no row width (2026-07-17 spec §2).
  const divergedBranch =
    session.worktree &&
    session.branch &&
    session.branch !== session.worktree.name
      ? session.branch
      : undefined;

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

  // Reveal model mirrors SessionRow: hover / keyboard-focus-inside / menu-open all reveal the
  // trigger and simultaneously vacate the right-aligned meta (line-1 time, line-2 model chip) via
  // `invisible` — both are wider than the 20px trigger, so it lands inside their kept-open space
  // and neither line reflows. The branch/worktree name span stays visible, keeping its tooltip
  // reachable. No fade gradient.
  const metaHide = cx(
    "group-hover:invisible group-has-[:focus-visible]:invisible",
    menu.open && "invisible",
  );
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
          <span
            className={cx(
              "shrink-0 text-[0.68rem] leading-none text-(--ui-text-quaternary)",
              metaHide,
            )}
          >
            {t.time.ago(session.lastActivityMs, Date.now())}
          </span>
          <span
            className={cx(
              "grid size-3.5 shrink-0 place-items-center",
              "group-hover:mr-5 group-has-[:focus-visible]:mr-5",
              menu.open && "mr-5",
            )}
            title={AGENTS[session.agent].label}
          >
            <AgentIcon agent={session.agent} size={13} />
          </span>
        </span>
        <span className="flex w-full min-w-0 items-center gap-1 pl-5 text-[0.72rem] leading-none text-(--ui-text-quaternary)">
          <span className="min-w-0 truncate">{repo}</span>
          {branch && (
            <>
              <Icon
                name={session.worktree ? "worktree" : "git-branch"}
                size={10}
                className="ml-0.5 shrink-0"
              />
              <span
                className="min-w-0 shrink-[2] truncate"
                title={
                  divergedBranch
                    ? t.shell.sessionRow.branchTooltip(divergedBranch)
                    : undefined
                }
              >
                {branch}
              </span>
            </>
          )}
          <span
            className={cx(
              "ml-auto shrink-0 rounded-sm border border-(--ui-stroke-tertiary) px-1 py-px text-[0.6rem] leading-none text-(--ui-text-tertiary)",
              metaHide,
            )}
          >
            {pinnedModelBadge(
              session.agent,
              session.model,
              session.modelId ?? session.modelRaw,
              session.management,
            )}
          </span>
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
            "grid size-5 cursor-pointer place-items-center rounded-sm text-(--ui-text-quaternary) opacity-0 transition-opacity duration-100 ease-out hover:bg-(--ui-control-hover-background) hover:text-fg focus-visible:opacity-100 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100",
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
