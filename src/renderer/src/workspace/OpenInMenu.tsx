import { useEffect, useId, useRef, useState } from "react";
import { OPEN_IN_FAILED_MESSAGE, type OpenInTarget } from "@shared/ipc";
import { Icon } from "../ui/icons";
import { openInItems } from "./open-in-items";

/** The header's "Open in" dropdown. The trigger toggles a flat menu of open targets; each item opens the
 *  session's working directory in that target (the path is resolved in the main process from `sessionId`).
 *  The menu closes on a successful open, an outside click, or Escape. A failed open keeps the menu open and
 *  shows an inline error. */
export function OpenInMenu({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const items = openInItems(window.api.platform);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Drop a stale error whenever the menu closes, so reopening starts clean.
  useEffect(() => {
    if (!open) setError(null);
  }, [open]);

  async function handleOpen(target: OpenInTarget) {
    if (busy) return; // one open at a time; a double-click can't fire two shell opens
    setBusy(true);
    setError(null); // clear any prior failure so a stale message never shows under the in-flight attempt
    try {
      const res = await window.api.openIn(sessionId, target);
      if (res.ok) setOpen(false);
      else setError(res.error);
    } catch {
      setError(OPEN_IN_FAILED_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        className="inline-flex items-center gap-1.5 rounded-md border border-ink-800 bg-ink-900 px-2.5 py-1 text-[12px] text-fg-muted transition-colors hover:border-ink-700 hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
      >
        Open in
        <Icon name="chevron-down" size={13} />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-30 mt-1.5 w-56 rounded-lg border border-ink-700 bg-ink-900 p-1.5 shadow-xl"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={() => void handleOpen(item.key)}
              disabled={busy}
              className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-[12px] text-fg-muted transition-colors hover:bg-ink-800 hover:text-fg focus-visible:outline-none focus-visible:bg-ink-800 disabled:opacity-50"
            >
              <Icon name={item.icon} size={13} />
              {item.label}
            </button>
          ))}
          {error && (
            <p role="alert" className="mt-1 px-2 py-1 text-[11px] text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
