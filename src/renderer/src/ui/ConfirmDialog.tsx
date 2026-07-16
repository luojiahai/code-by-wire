import { cx, focusRing } from "./atoms";
import { ModalShell } from "./ModalShell";
import { useI18n } from "../i18n";

/** A minimal confirm/cancel modal, gating a risky action behind an explicit choice. Built on ModalShell
 *  (overlay, centered panel, Escape/overlay to cancel, Tab trap, focus restored on close). The body
 *  carries the warning; the confirm button proceeds. `tone="danger"` reds the confirm button for a
 *  destructive action; the default primary tone is unchanged for every existing call site.
 *  `title`/`body`/`confirmLabel`/`cancelLabel` are caller-supplied — every caller already translates
 *  its own copy when constructing them. This component only owns the two DEFAULT button labels, which
 *  fall back to `common.continue`/`common.cancel` rather than a hardcoded English literal. */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = "primary",
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const resolvedConfirmLabel = confirmLabel ?? t.common.continue;
  const resolvedCancelLabel = cancelLabel ?? t.common.cancel;
  // The filled confirm button already wears a static `ring-1 ring-{tone}/40` as its border, so a faint
  // focus ring on top would blend in. On `:focus-visible` brighten that ring to a full-opacity 2px in the
  // button's own tone, so keyboard focus reads clearly without mixing in a second color.
  const confirmClass =
    tone === "danger"
      ? "rounded-md bg-danger px-3 py-1.5 text-body font-medium text-white ring-1 ring-danger/40 transition-colors hover:bg-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
      : "rounded-md bg-primary px-3 py-1.5 text-body font-medium text-ink-950 ring-1 ring-primary/40 transition-colors hover:bg-primary-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  return (
    <ModalShell
      labelledBy="confirm-title"
      widthClass="w-[26rem]"
      onClose={onCancel}
    >
      <div id="confirm-title" className="text-subhead font-semibold">
        {title}
      </div>
      <p className="mt-2 text-aux leading-relaxed text-fg-faint">{body}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={cx(
            "rounded-md px-3 py-1.5 text-body text-fg-muted transition-colors hover:text-fg",
            focusRing,
          )}
        >
          {resolvedCancelLabel}
        </button>
        <button type="button" onClick={onConfirm} className={confirmClass}>
          {resolvedConfirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}
