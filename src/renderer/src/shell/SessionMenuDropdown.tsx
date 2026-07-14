import { createPortal } from "react-dom";
import type { Session } from "@shared/types";
import { cx } from "../ui/atoms";
import { Icon, type IconName } from "../ui/icons";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import type { SessionMenuController } from "./use-session-menu";

const MENU_WIDTH = 256;

/** The portaled dropdown body shared by every session-menu trigger: six always-rendered action rows
 *  (only `disabled`/`title` vary — the design's "never hide an action, dim the unavailable ones with a
 *  reason" rule) plus the confirm dialogs Adopt/Fork/End can raise. Pure rendering — all state lives in
 *  `useSessionMenu`. */
export function SessionMenuDropdown({
  session,
  menu,
}: {
  session: Session;
  menu: SessionMenuController;
}) {
  const {
    open,
    pos,
    menuId,
    menuRef,
    closeMenu,
    openEdit,
    items,
    openInBusy,
    openInError,
    handleOpenIn,
    adopt,
    fork,
    end,
    live,
    adoptDisabled,
    adoptTitle,
    forkDisabled,
    forkTitle,
    endTitle,
  } = menu;

  return (
    <>
      {open && pos
        ? createPortal(
            <div
              id={menuId}
              ref={menuRef}
              role="menu"
              style={{
                position: "fixed",
                left: pos.left,
                top: pos.top,
                width: MENU_WIDTH,
              }}
              className="z-50 rounded-lg border border-(--ui-stroke-secondary) bg-[color-mix(in_srgb,var(--ui-bg-elevated)_96%,transparent)] p-1.5 shadow-(--shadow-md) backdrop-blur-xl"
            >
              <MenuItem
                icon="copy"
                label="Copy session ID"
                title={session.id}
                onClick={() => {
                  void window.api.clipboardWriteText(session.id);
                  closeMenu();
                }}
              />
              <MenuItem icon="pencil" label="Rename" onClick={openEdit} />

              {adopt.error && (
                <p role="alert" className="px-2 py-1 text-xs text-danger">
                  {adopt.error}
                </p>
              )}
              <MenuItem
                icon="git-pull-request-arrow"
                label={adopt.busy ? "Adopting…" : "Adopt"}
                onClick={adopt.request}
                disabled={adoptDisabled || adopt.busy}
                title={adoptTitle}
              />

              {fork.error && (
                <p role="alert" className="px-2 py-1 text-xs text-danger">
                  {fork.error}
                </p>
              )}
              <MenuItem
                icon="git-branch"
                label={fork.busy ? "Forking…" : "Fork"}
                onClick={fork.request}
                disabled={forkDisabled || fork.busy}
                title={forkTitle}
              />

              <MenuItem
                icon="square"
                label="End session"
                onClick={end.request}
                disabled={!live}
                title={endTitle}
                danger
              />

              <div
                role="separator"
                aria-orientation="horizontal"
                className="my-1 h-px bg-(--ui-stroke-tertiary)"
              />

              <div className="px-2 pb-1 pt-0.5 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-(--theme-primary)">
                Open in
              </div>
              {items.map((item) => (
                <MenuItem
                  key={item.key}
                  icon={item.icon}
                  label={item.label}
                  onClick={() => void handleOpenIn(item.key)}
                  disabled={openInBusy}
                />
              ))}
              {openInError && (
                <p role="alert" className="mt-1 px-2 py-1 text-xs text-danger">
                  {openInError}
                </p>
              )}
            </div>,
            document.body,
          )
        : null}

      {adopt.confirmOpen && (
        <ConfirmDialog
          title="Resume a session with no recorded model?"
          body="This session never recorded a model — it likely errored before its first turn — so resuming it may fail with a model error. Continue anyway?"
          confirmLabel="Resume anyway"
          onCancel={adopt.confirmNo}
          onConfirm={adopt.confirmYes}
        />
      )}
      {fork.confirmOpen && (
        <ConfirmDialog
          title="Fork a session with no recorded model?"
          body="This session never recorded a model — it likely errored before its first turn — so forking it may fail with a model error. Continue anyway?"
          confirmLabel="Fork anyway"
          onCancel={fork.confirmNo}
          onConfirm={fork.confirmYes}
        />
      )}
      {end.confirmOpen && (
        <ConfirmDialog
          title="End this session?"
          body="A turn is in progress and will be interrupted. The conversation is saved and can be resumed later with Adopt."
          confirmLabel="End session"
          tone="danger"
          onConfirm={end.confirmYes}
          onCancel={end.confirmNo}
        />
      )}
    </>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  title,
  danger,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cx(
        "flex w-full items-center gap-2.5 rounded-xs px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:bg-(--ui-control-hover-background) disabled:cursor-default disabled:opacity-40",
        danger
          ? "text-danger enabled:hover:bg-danger/10"
          : "text-fg-muted enabled:hover:bg-(--ui-control-hover-background) enabled:hover:text-fg",
      )}
    >
      <Icon name={icon} size={13} />
      {label}
    </button>
  );
}
