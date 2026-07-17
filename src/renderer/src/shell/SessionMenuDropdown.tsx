import { createPortal } from "react-dom";
import type { Session } from "@shared/types";
import { cx } from "../ui/atoms";
import { Icon, type IconName } from "../ui/icons";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useI18n } from "../i18n";
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
    pinned,
    togglePin,
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
  const { t } = useI18n();

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
                icon={pinned ? "pin-off" : "pin"}
                label={
                  pinned ? t.shell.sessionMenu.unpin : t.shell.sessionMenu.pin
                }
                onClick={togglePin}
              />
              <MenuItem
                icon="copy"
                label={t.shell.sessionMenu.copySessionId}
                title={session.id}
                onClick={() => {
                  void window.api.clipboardWriteText(session.id);
                  closeMenu();
                }}
              />
              <MenuItem
                icon="pencil"
                label={t.shell.sessionMenu.rename}
                onClick={openEdit}
              />

              {adopt.error && (
                <p role="alert" className="px-2 py-1 text-xs text-danger">
                  {adopt.error}
                </p>
              )}
              <MenuItem
                icon="git-pull-request-arrow"
                label={
                  adopt.busy
                    ? t.shell.sessionMenu.adopting
                    : t.shell.sessionMenu.adopt
                }
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
                label={
                  fork.busy
                    ? t.shell.sessionMenu.forking
                    : t.shell.sessionMenu.fork
                }
                onClick={fork.request}
                disabled={forkDisabled || fork.busy}
                title={forkTitle}
              />

              <MenuItem
                icon="square"
                label={t.shell.sessionMenu.endSession}
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
                {t.shell.sessionMenu.openIn}
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
          title={t.shell.sessionMenu.resumeConfirmTitle}
          body={t.shell.sessionMenu.resumeConfirmBody}
          confirmLabel={t.shell.sessionMenu.resumeConfirmLabel}
          onCancel={adopt.confirmNo}
          onConfirm={adopt.confirmYes}
        />
      )}
      {fork.confirmOpen && (
        <ConfirmDialog
          title={t.shell.sessionMenu.forkConfirmTitle}
          body={t.shell.sessionMenu.forkConfirmBody}
          confirmLabel={t.shell.sessionMenu.forkConfirmLabel}
          onCancel={fork.confirmNo}
          onConfirm={fork.confirmYes}
        />
      )}
      {end.confirmOpen && (
        <ConfirmDialog
          title={t.shell.sessionMenu.endConfirmTitle}
          body={t.shell.sessionMenu.endConfirmBody}
          confirmLabel={t.shell.sessionMenu.endSession}
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
