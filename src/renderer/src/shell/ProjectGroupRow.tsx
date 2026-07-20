import { cx } from "../ui/atoms";
import { Icon } from "../ui/icons";
import type { SessionGroup } from "./session-list-model";
import { useId } from "react";

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
  const duplicate = group.hint !== undefined && cwd !== undefined;
  const tooltipId = useId();
  return (
    <div className="group/project relative flex min-h-[1.625rem] items-center rounded-md transition-colors duration-100 ease-out hover:bg-(--ui-row-hover-background) hover:transition-none focus-within:bg-(--ui-row-hover-background)">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-describedby={duplicate ? tooltipId : undefined}
        title={cwd && quickAddDisabled ? unavailableReason : undefined}
        className="group/project-toggle flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md py-0.5 pl-2 text-left"
      >
        <span className="grid size-3.5 shrink-0 place-items-center text-(--ui-text-tertiary)">
          <Icon name={collapsed ? "folder" : "folder-open"} size={14} />
        </span>
        <span className="group/name relative inline-flex min-w-0">
          <span
            className={cx(
              "min-w-0 truncate text-[0.8125rem] leading-none text-(--ui-text-tertiary) group-hover/project:text-fg",
              duplicate &&
                "underline decoration-dotted decoration-(--ui-text-quaternary) underline-offset-2",
            )}
          >
            {group.label}
          </span>
          {duplicate && (
            <span
              id={tooltipId}
              role="tooltip"
              className="absolute left-0 top-full z-20 mt-1 hidden max-w-64 whitespace-nowrap rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) px-2 py-1 text-xs text-fg shadow-(--shadow-md) group-hover/name:block group-focus-visible/project-toggle:block"
            >
              {cwd}
            </span>
          )}
        </span>
        <span className="grid size-3.5 shrink-0 place-items-center text-(--ui-text-quaternary)">
          <Icon
            name="chevron-right"
            size={13}
            className={cx("transition-transform", !collapsed && "rotate-90")}
          />
        </span>
      </button>
      {cwd && (
        <div className="mr-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-100 ease-out group-hover/project:opacity-100 group-focus-within/project:opacity-100">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onQuickAdd(event.currentTarget);
            }}
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
            onClick={(event) => {
              event.stopPropagation();
              onTogglePin();
            }}
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
