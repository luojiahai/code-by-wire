import { cx } from "../ui/atoms";
import { Icon } from "../ui/icons";
import type { SessionGroup } from "./session-list-model";
import type { ProjectPlacement } from "@shared/ipc";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { placeProjectMenu, PROJECT_MENU_WIDTH } from "./project-menu-position";
import { runProjectPlacementAction } from "./project-placement-action";

export function ProjectGroupRow({
  group,
  collapsed,
  placement,
  quickAddDisabled,
  quickAdding,
  unavailableReason,
  newSessionLabel,
  pinLabel,
  unpinLabel,
  hideLabel,
  unhideLabel,
  projectActionsLabel,
  absolutePathLabel,
  copyPathLabel,
  onToggle,
  onQuickAdd,
  onSetPlacement,
}: {
  group: SessionGroup;
  collapsed: boolean;
  placement: ProjectPlacement;
  quickAddDisabled: boolean;
  quickAdding: boolean;
  unavailableReason: string;
  newSessionLabel?: string;
  pinLabel: string;
  unpinLabel: string;
  hideLabel: string;
  unhideLabel: string;
  projectActionsLabel: string;
  absolutePathLabel: string;
  copyPathLabel: string;
  onToggle: () => void;
  onQuickAdd: (button: HTMLButtonElement) => void;
  onSetPlacement: (placement: ProjectPlacement) => Promise<void>;
}) {
  const cwd = group.cwd;
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(
    null,
  );
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const placementPendingRef = useRef(false);
  const [placementPending, setPlacementPending] = useState(false);
  const setPlacement = async (placement: ProjectPlacement) => {
    if (placementPendingRef.current) return;
    placementPendingRef.current = true;
    setPlacementPending(true);
    try {
      await runProjectPlacementAction(onSetPlacement, placement, () =>
        setMenuOpen(false),
      );
    } finally {
      placementPendingRef.current = false;
      setPlacementPending(false);
    }
  };
  const placeMenu = useCallback(() => {
    const trigger = menuTriggerRef.current?.getBoundingClientRect();
    if (!trigger) return;
    setMenuPos(
      placeProjectMenu(
        trigger,
        { width: window.innerWidth, height: window.innerHeight },
        menuRef.current?.getBoundingClientRect().height ?? 280,
      ),
    );
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    placeMenu();
    function onDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !menuTriggerRef.current?.contains(target)
      ) {
        setMenuOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuTriggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", placeMenu, true);
    window.addEventListener("resize", placeMenu);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", placeMenu, true);
      window.removeEventListener("resize", placeMenu);
    };
  }, [menuOpen, placeMenu]);

  return (
    <div className="group/project relative flex min-h-[1.625rem] items-center rounded-md transition-colors duration-100 ease-out hover:bg-(--ui-row-hover-background) hover:transition-none focus-within:bg-(--ui-row-hover-background)">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        title={cwd && quickAddDisabled ? unavailableReason : undefined}
        className="group/project-toggle flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md py-0.5 pl-2 text-left"
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
      </button>
      {cwd && (
        <div
          className={cx(
            "mr-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-100 ease-out group-hover/project:opacity-100 group-focus-within/project:opacity-100",
            menuOpen && "opacity-100",
          )}
        >
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
            ref={menuTriggerRef}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (!menuOpen) placeMenu();
              setMenuOpen((open) => !open);
            }}
            aria-label={projectActionsLabel}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="grid size-5 cursor-pointer place-items-center rounded-sm text-(--ui-text-quaternary) hover:bg-(--ui-control-hover-background) hover:text-fg"
          >
            <Icon name="ellipsis" size={13} />
          </button>
          {menuOpen &&
            menuPos &&
            createPortal(
              <div
                ref={menuRef}
                role="menu"
                style={{
                  position: "fixed",
                  left: menuPos.left,
                  top: menuPos.top,
                  width: PROJECT_MENU_WIDTH,
                }}
                className="z-50 rounded-lg border border-(--ui-stroke-secondary) bg-[color-mix(in_srgb,var(--ui-bg-elevated)_96%,transparent)] p-1.5 shadow-(--shadow-md) backdrop-blur-xl"
              >
                {placement === "hidden" ? (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={placementPending}
                    onClick={(event) => {
                      event.stopPropagation();
                      void setPlacement("ordinary").catch(() => undefined);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xs px-2 py-1.5 text-left text-xs text-fg-muted hover:bg-(--ui-control-hover-background) hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Icon name="eye-off" size={12} />
                    {unhideLabel}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={placementPending}
                      onClick={(event) => {
                        event.stopPropagation();
                        void setPlacement(
                          placement === "pinned" ? "ordinary" : "pinned",
                        ).catch(() => undefined);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xs px-2 py-1.5 text-left text-xs text-fg-muted hover:bg-(--ui-control-hover-background) hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Icon
                        name={placement === "pinned" ? "pin-off" : "pin"}
                        size={12}
                      />
                      {placement === "pinned" ? unpinLabel : pinLabel}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={placementPending}
                      onClick={(event) => {
                        event.stopPropagation();
                        void setPlacement("hidden").catch(() => undefined);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xs px-2 py-1.5 text-left text-xs text-fg-muted hover:bg-(--ui-control-hover-background) hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Icon name="eye-off" size={12} />
                      {hideLabel}
                    </button>
                  </>
                )}
                <div
                  role="separator"
                  className="mx-1 my-1 border-t border-(--ui-stroke-secondary)"
                />
                <div className="px-2 py-1">
                  <div className="text-[0.6875rem] font-medium text-(--ui-text-quaternary)">
                    {absolutePathLabel}
                  </div>
                  <div className="mt-0.5 break-all text-xs leading-snug text-fg-muted">
                    {cwd}
                  </div>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    event.stopPropagation();
                    void window.api.clipboardWriteText(cwd);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xs px-2 py-1.5 text-left text-xs text-fg-muted hover:bg-(--ui-control-hover-background) hover:text-fg"
                >
                  <Icon name="copy" size={12} />
                  {copyPathLabel}
                </button>
              </div>,
              document.body,
            )}
        </div>
      )}
    </div>
  );
}
