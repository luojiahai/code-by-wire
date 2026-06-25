import { ModalShell } from "../../ui/ModalShell";
import { PricingEditor } from "../../settings/PricingEditor";
import type { Family, PricingOverrides } from "@shared/models";

/** The session-panel pricing editor in a modal: the shared PricingEditor with the session's model row
 *  highlighted. Opened by the Tokens panel's ✎. Saving routes through onChange up to the app, which persists
 *  and re-prices the panel immediately. Closes on Escape / overlay click (ModalShell) or the × button. */
export function PricingModal({
  overrides,
  onChange,
  highlightFamily,
  onClose,
}: {
  overrides: PricingOverrides;
  onChange: (next: PricingOverrides) => void;
  highlightFamily: Family;
  onClose: () => void;
}) {
  return (
    <ModalShell
      labelledBy="pricing-modal-title"
      widthClass="w-[44rem]"
      onClose={onClose}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="pricing-modal-title"
            className="text-sm font-semibold text-fg"
          >
            Model pricing
          </h2>
          <p className="mt-1 text-[12px] text-fg-faint">
            Edit the $/1M rates used to value usage. Changes apply everywhere,
            including past sessions.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 text-lg leading-none text-fg-faint transition-colors hover:text-fg"
        >
          ×
        </button>
      </div>
      <div className="mt-4">
        <PricingEditor
          overrides={overrides}
          onChange={onChange}
          highlightFamily={highlightFamily}
        />
      </div>
    </ModalShell>
  );
}
