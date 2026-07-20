import {
  useEffect,
  useRef,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { cx } from "./atoms";

/** Shared chrome for the app's modals: a dimmed overlay, a viewport-contained focusable panel,
 *  Escape-to-close, a Tab focus-trap that keeps focus inside the panel, and focus restored on close.
 *  `closeDisabled` suppresses the Escape and overlay-click close paths (used while a dialog is busy).
 *  Oversized content scrolls inside the panel. The caller owns the heading/body/buttons. */
export function ModalShell({
  labelledBy,
  widthClass,
  contentOverflow = "auto",
  closeDisabled = false,
  onClose,
  children,
}: {
  labelledBy: string;
  widthClass: string;
  /** Detail modals constrain their own content regions and suppress the native whole-body scrollbar. */
  contentOverflow?: "auto" | "hidden";
  closeDisabled?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !closeDisabled) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeDisabled, onClose]);

  // Move focus into the dialog on open and restore it to whatever had focus when it closes, so keyboard
  // and screen-reader users aren't stranded on the now-obscured app behind the overlay.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => prev?.focus?.();
  }, []);

  // Keep Tab cycling within the dialog instead of wandering to the hidden app behind it.
  function trapTab(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hasAttribute("disabled"));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      onClick={closeDisabled ? undefined : onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        data-selectable-text="true"
        tabIndex={-1}
        className={cx(
          "max-h-[calc(100vh-2rem)] rounded-xl border border-ink-700 bg-ink-900 p-5 text-fg shadow-2xl outline-none",
          widthClass,
        )}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapTab}
      >
        <div
          className={cx(
            "max-h-[calc(100vh-5rem)]",
            contentOverflow === "auto" ? "overflow-y-auto" : "overflow-hidden",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
