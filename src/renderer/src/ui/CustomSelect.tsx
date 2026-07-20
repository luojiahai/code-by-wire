import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cx } from "./atoms";
import {
  firstEnabledIndex,
  lastEnabledIndex,
  moveEnabledIndex,
  selectedOrFirstEnabledIndex,
} from "./custom-select-model";
import { Icon } from "./icons";

export interface CustomSelectOption<T extends string | number> {
  value: T;
  label: string;
  leading?: ReactNode;
  secondary?: string;
  disabled?: boolean;
}

export function CustomSelect<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  menuClassName,
}: {
  value: T;
  options: readonly CustomSelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listboxRef = useRef<HTMLDivElement | null>(null);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const current = options[selectedIndex];
  const disabled = firstEnabledIndex(options) === -1;

  const close = useCallback(() => setOpen(false), []);
  const select = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option || option.disabled) return;
      onChange(option.value);
      close();
      triggerRef.current?.focus();
    },
    [close, onChange, options],
  );

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    setActiveIndex(selectedOrFirstEnabledIndex(options, selectedIndex));
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    setActiveIndex((index) => selectedOrFirstEnabledIndex(options, index));
  }, [open, options]);

  useEffect(() => {
    if (open) listboxRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node))
        close();
    };
    const onKey = (event: KeyboardEvent) => {
      switch (event.key) {
        case "Escape":
          event.preventDefault();
          close();
          triggerRef.current?.focus();
          break;
        case "ArrowDown":
          event.preventDefault();
          setActiveIndex((index) => moveEnabledIndex(options, index, 1));
          break;
        case "ArrowUp":
          event.preventDefault();
          setActiveIndex((index) => moveEnabledIndex(options, index, -1));
          break;
        case "Home":
          event.preventDefault();
          setActiveIndex(firstEnabledIndex(options));
          break;
        case "End":
          event.preventDefault();
          setActiveIndex(lastEnabledIndex(options));
          break;
        case "Enter":
        case " ":
          event.preventDefault();
          select(activeIndex);
          break;
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [activeIndex, close, open, options, select]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={toggle}
        className={cx(
          "flex items-center gap-2 rounded-md border border-ink-800 px-3 py-1.5 text-body text-fg transition-colors hover:bg-ink-900 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {current?.leading}
          <span className="truncate">{current?.label ?? "—"}</span>
        </span>
        <Icon
          name="chevron-down"
          size={13}
          className="ml-auto shrink-0 text-fg-faint"
        />
      </button>
      {open && (
        <div
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          aria-activedescendant={
            activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
          }
          tabIndex={-1}
          className={cx(
            "absolute right-0 top-full z-50 mt-1.5 min-w-full rounded-lg border border-(--ui-stroke-secondary) bg-[color-mix(in_srgb,var(--ui-bg-elevated)_96%,transparent)] p-1.5 shadow-(--shadow-md) backdrop-blur-xl",
            menuClassName,
          )}
        >
          {options.map((option, index) => {
            const selected = index === selectedIndex;
            const active = index === activeIndex;
            return (
              <button
                key={option.value}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={selected}
                aria-disabled={Boolean(option.disabled)}
                disabled={option.disabled}
                onMouseEnter={() => {
                  if (!option.disabled) setActiveIndex(index);
                }}
                onClick={() => select(index)}
                className={cx(
                  "flex w-full items-center justify-between gap-3 rounded-xs px-2 py-1.5 text-left text-xs transition-colors",
                  option.disabled
                    ? "cursor-not-allowed text-fg-faint opacity-50"
                    : active
                      ? "bg-(--ui-control-hover-background) text-fg"
                      : selected
                        ? "text-fg"
                        : "text-fg-muted hover:bg-(--ui-control-hover-background) hover:text-fg",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {option.leading}
                  <span className="truncate">{option.label}</span>
                  {option.secondary && (
                    <span className="shrink-0 text-fg-faint">
                      {option.secondary}
                    </span>
                  )}
                </span>
                {selected && (
                  <Icon name="check" size={12} className="shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
