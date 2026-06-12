import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../ui/icons";
import { OPEN_IN_GROUPS } from "./open-in-items";

/** The header's "Open in" dropdown. The trigger toggles a grouped menu of open targets. Every item is a
 *  disabled placeholder for now (its tooltip says so); wiring lands later. The menu closes on an outside
 *  click or Escape. */
export function OpenInMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

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
          {OPEN_IN_GROUPS.map(({ group, label, items }) => (
            <div key={group} className="py-1 first:pt-0.5">
              <div
                role="presentation"
                className="px-2 pb-1 text-[9px] uppercase tracking-wider text-fg-faint"
              >
                {label}
              </div>
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  disabled
                  title="Coming soon"
                  className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-[12px] text-fg-muted opacity-40"
                >
                  <Icon name={item.icon} size={13} />
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
