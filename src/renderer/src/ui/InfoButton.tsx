import { useId, type ReactNode } from "react";
import { cx } from "./atoms";
import { Icon } from "./icons";

/** A small "ⓘ" button that reveals `children` in a popover on hover or keyboard focus. The reveal is
 *  CSS-only (no state) scoped to this button's own `group`, so it survives re-renders and the cursor can
 *  move into the popover without it vanishing. The popover is wired to the button via `aria-describedby`
 *  so screen readers announce its content. The popover is `absolute` against the nearest positioned
 *  ancestor; the caller supplies its position, width, and chrome through `popoverClassName`. */
export function InfoButton({
  label,
  popoverClassName,
  children,
}: {
  label: string;
  popoverClassName?: string;
  children: ReactNode;
}) {
  const tooltipId = useId();
  return (
    <span className="group inline-flex items-center">
      <button
        type="button"
        aria-label={label}
        aria-describedby={tooltipId}
        className="inline-flex h-[14px] w-[14px] items-center justify-center rounded-full text-fg-faint transition-colors hover:text-fg-muted focus-visible:text-fg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
      >
        <Icon name="info" size={12} />
      </button>
      <span
        role="tooltip"
        id={tooltipId}
        className={cx(
          "absolute z-20 hidden group-hover:block group-focus-within:block",
          popoverClassName,
        )}
      >
        {children}
      </span>
    </span>
  );
}
