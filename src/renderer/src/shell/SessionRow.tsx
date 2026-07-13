import type { Session } from "@shared/types";
import { cx, Lamp } from "../ui/atoms";
import { Icon } from "../ui/icons";
import { providerBadge } from "../ui/session-glyph";

/**
 * The hermes single-line sidebar row: a 26px-tall strip with a state `Lamp` and the title — one
 * plain select button, no hover extras. The relative-time stamp moved to the right sidebar's
 * Session panel (Active row), and the copy-ID button is gone with it; no project·branch line and
 * no context-% chip either, which also live in the right sidebar now. The extras are the dimmed
 * worktree hint on sessions that merged into their repo's folder (2026-07-09 worktree-merge spec)
 * and the provider badge on sessions a foreign CLI owns (Codex), styled to match.
 */
export function SessionRow({
  session,
  selected,
  onSelect,
}: {
  session: Session;
  selected: boolean;
  onSelect: () => void;
}) {
  const badge = providerBadge(session.providerId);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Open ${session.title}`}
      className={cx(
        "group flex min-h-[1.625rem] min-w-0 cursor-pointer items-center gap-1.5 rounded-md py-0.5 pl-2 pr-2 text-left transition-colors duration-100 ease-out hover:transition-none",
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
        <span className="flex min-w-0 shrink-[2] items-center gap-1 text-[0.72rem] leading-none text-(--ui-text-quaternary)">
          <Icon name="git-branch" size={10} className="shrink-0" />
          <span className="truncate">{session.worktree.name}</span>
        </span>
      )}
      {badge && (
        <span
          title={`${badge} session — read-only`}
          className="shrink-0 font-mono text-[0.62rem] uppercase leading-none tracking-wider text-(--ui-text-quaternary)"
        >
          {badge}
        </span>
      )}
    </button>
  );
}
