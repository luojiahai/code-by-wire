import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { cx } from "./atoms";
import {
  firstEnabledIndex,
  intersectVerticalBounds,
  lastEnabledIndex,
  menuPlacement,
  moveEnabledIndex,
  selectedOrFirstEnabledIndex,
  type MenuPlacement,
  type VerticalBounds,
} from "./custom-select-model";
import { Icon } from "./icons";

const MENU_GAP = 6;
const CLIPPING_OVERFLOW = new Set(["auto", "clip", "hidden", "scroll"]);

function clippingBounds(element: HTMLElement): VerticalBounds {
  let bounds = { top: 0, bottom: window.innerHeight };
  for (
    let ancestor = element.parentElement;
    ancestor;
    ancestor = ancestor.parentElement
  ) {
    if (!CLIPPING_OVERFLOW.has(getComputedStyle(ancestor).overflowY)) continue;
    const rect = ancestor.getBoundingClientRect();
    const top = rect.top + ancestor.clientTop;
    bounds = intersectVerticalBounds(bounds, {
      top,
      bottom: top + ancestor.clientHeight,
    });
  }
  return bounds;
}

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
  const [placement, setPlacement] = useState<MenuPlacement>({
    side: "below",
    maxHeight: 0,
  });
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

  const placeMenu = useCallback(() => {
    const root = rootRef.current;
    const trigger = triggerRef.current;
    const listbox = listboxRef.current;
    if (!root || !trigger || !listbox) return;
    const triggerRect = trigger.getBoundingClientRect();
    const bounds = clippingBounds(root);
    const next = menuPlacement({
      triggerTop: triggerRect.top,
      triggerBottom: triggerRect.bottom,
      boundaryTop: bounds.top,
      boundaryBottom: bounds.bottom,
      menuHeight: listbox.scrollHeight,
      gap: MENU_GAP,
    });
    setPlacement((current) =>
      current.side === next.side && current.maxHeight === next.maxHeight
        ? current
        : next,
    );
  }, []);

  useEffect(() => {
    if (!open) return;
    setActiveIndex((index) => selectedOrFirstEnabledIndex(options, index));
  }, [open, options]);

  useEffect(() => {
    if (open) listboxRef.current?.focus({ preventScroll: true });
  }, [open]);

  useLayoutEffect(() => {
    if (open) placeMenu();
  }, [open, options, placeMenu]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => placeMenu();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, placeMenu]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const option = listboxRef.current?.children.item(activeIndex);
    if (option instanceof HTMLElement)
      option.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
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
    },
    [activeIndex, close, options, select],
  );

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) close();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node))
        close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [close, open]);

  return (
    <div ref={rootRef} onBlur={onBlur} className="relative shrink-0">
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
          onKeyDown={onKeyDown}
          style={{ maxHeight: placement.maxHeight }}
          className={cx(
            "absolute right-0 z-50 min-w-full overflow-y-auto overscroll-contain rounded-lg border border-(--ui-stroke-secondary) bg-[color-mix(in_srgb,var(--ui-bg-elevated)_96%,transparent)] p-1.5 shadow-(--shadow-md) backdrop-blur-xl",
            placement.side === "above"
              ? "bottom-full mb-1.5"
              : "top-full mt-1.5",
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
