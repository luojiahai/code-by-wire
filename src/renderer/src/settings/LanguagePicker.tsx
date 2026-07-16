import { useEffect, useRef, useState } from "react";
import { LOCALE_OPTIONS } from "@shared/locale";
import { useI18n } from "../i18n";
import { Icon } from "../ui/icons";
import { cx } from "../ui/atoms";

/** The Language control: hermes's LanguageSwitcher shape (globe + current endonym
 *  trigger; rows of endonym + mono locale code + check on the active one; curated
 *  order; no flags), minus its search box — pointless at two entries. */
export function LanguagePicker() {
  const { t, locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current =
    LOCALE_OPTIONS.find((o) => o.id === locale) ?? LOCALE_OPTIONS[0];

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t.settings.appearance.language}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md border border-ink-800 px-3 py-1.5 text-body text-fg transition-colors hover:bg-ink-900"
      >
        <Icon name="globe" size={13} className="text-fg-faint" />
        {current.name}
        <Icon name="chevron-down" size={13} className="text-fg-faint" />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={t.settings.appearance.language}
          className="absolute right-0 top-full z-50 mt-1.5 w-48 rounded-lg border border-(--ui-stroke-secondary) bg-[color-mix(in_srgb,var(--ui-bg-elevated)_96%,transparent)] p-1.5 shadow-(--shadow-md) backdrop-blur-xl"
        >
          {LOCALE_OPTIONS.map((option) => {
            const active = option.id === locale;
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  setLocale(option.id);
                  setOpen(false);
                }}
                className={cx(
                  "flex w-full items-center justify-between rounded-xs px-2 py-1.5 text-left text-xs transition-colors",
                  active
                    ? "text-fg"
                    : "text-fg-muted hover:bg-(--ui-control-hover-background) hover:text-fg",
                )}
              >
                {option.name}
                <span className="flex items-center gap-1.5 font-mono text-[0.64rem] uppercase text-fg-faint">
                  {option.id}
                  {active && <Icon name="check" size={12} />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
