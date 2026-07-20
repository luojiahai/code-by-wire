import { cx } from "../ui/atoms";
import { Icon } from "../ui/icons";
import type { SessionGroup } from "./session-list-model";

export function ProjectGroupRow({
  group,
  collapsed,
  pinned,
  quickAddDisabled,
  quickAdding,
  unavailableReason,
  newSessionLabel,
  pinLabel,
  unpinLabel,
  onToggle,
  onQuickAdd,
  onTogglePin,
}: {
  group: SessionGroup;
  collapsed: boolean;
  pinned: boolean;
  quickAddDisabled: boolean;
  quickAdding: boolean;
  unavailableReason: string;
  newSessionLabel?: string;
  pinLabel: string;
  unpinLabel: string;
  onToggle: () => void;
  onQuickAdd: (button: HTMLButtonElement) => void;
  onTogglePin: () => void;
}) {
  const cwd = group.cwd;
  return (
    <div className="group/project relative flex min-h-[1.625rem] items-center rounded-md transition-colors duration-100 ease-out hover:bg-(--ui-row-hover-background) hover:transition-none focus-within:bg-(--ui-row-hover-background)">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        title={cwd && quickAddDisabled ? unavailableReason : cwd}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md py-0.5 pl-2 text-left"
      >
        <span className="grid size-3.5 shrink-0 place-items-center text-(--ui-text-tertiary)">
          <Icon name={collapsed ? "folder" : "folder-open"} size={14} />
        </span>
        <span className="min-w-0 truncate text-[0.8125rem] leading-none text-(--ui-text-tertiary) group-hover/project:text-fg">
          {group.label}
        </span>
        <span className="grid size-3.5 shrink-0 place-items-center text-(--ui-text-quaternary)">
          <Icon
            name="chevron-right"
            size={13}
            className={cx("transition-transform", !collapsed && "rotate-90")}
          />
        </span>
        {group.hint && (
          <span className="min-w-0 shrink-[2] truncate text-[0.72rem] leading-none text-(--ui-text-quaternary)">
            {group.hint}
          </span>
        )}
      </button>
      {cwd && (
        <div className="mr-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-100 ease-out group-hover/project:opacity-100 group-focus-within/project:opacity-100">
          <button
            type="button"
            onClick={(event) => onQuickAdd(event.currentTarget)}
            disabled={quickAddDisabled || quickAdding}
            aria-label={newSessionLabel}
            title={quickAddDisabled ? unavailableReason : newSessionLabel}
            className={cx(
              "grid size-5 place-items-center rounded-sm",
              !quickAddDisabled && !quickAdding
                ? "cursor-pointer text-(--ui-text-quaternary) hover:bg-(--ui-control-hover-background) hover:text-fg"
                : "cursor-not-allowed text-(--ui-text-quaternary)/50",
            )}
          >
            <Icon name="plus" size={13} />
          </button>
          <button
            type="button"
            onClick={onTogglePin}
            aria-label={pinned ? unpinLabel : pinLabel}
            title={pinned ? unpinLabel : pinLabel}
            className="grid size-5 cursor-pointer place-items-center rounded-sm text-(--ui-text-quaternary) hover:bg-(--ui-control-hover-background) hover:text-fg"
          >
            <Icon name={pinned ? "pin-off" : "pin"} size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
