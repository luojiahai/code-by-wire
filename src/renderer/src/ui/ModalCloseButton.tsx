import { useI18n } from "../i18n";

/** Visible dismissal control for read-only detail modals. Escape and backdrop-click remain
 *  available through ModalShell, but neither is a discoverable or tabbable replacement for this. */
export function ModalCloseButton({
  onClose,
  disabled = false,
}: {
  onClose: () => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClose}
      disabled={disabled}
      className="rounded-sm border border-ink-700 px-2 py-0.5 text-fg-muted transition-colors hover:border-ink-600 hover:text-fg disabled:opacity-40"
    >
      {t.common.close}
    </button>
  );
}
