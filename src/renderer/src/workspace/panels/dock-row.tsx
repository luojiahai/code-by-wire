import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cx, focusRingInset } from "../../ui/atoms";

// Shared row grammar for the Activity dock tabs (Tasks / Subagents / Shells / Turns): a fixed status
// gutter, a flex-1 truncating label, and a right-aligned mono metric rack. Each row is a listitem (the tab
// wraps them in a role="list"). Rows are transparent and split by a hairline; interactive rows hover (but
// an active row holds its background) and carry the inset focus ring. A `fill` node renders as a full-bleed
// band behind the content, clipped to the row and kept a sibling of the button rather than nested inside
// it, used by the Subagents Gantt. Restyling the dock lands here once.

/** The leading-slot width: wide enough for a status glyph or a two-digit turn index. */
export const DOCK_GUTTER = "w-6";

/** One dock row, a listitem. Interactive (a `<button>`) when `onClick` is given, otherwise a `<div>`;
 *  `children` is the label. The row itself is the positioning context and the hairline/background owner, so
 *  the `fill` band stays a sibling of the button (never a `<div>` inside it) and is clipped to the row. */
export function DockRow({
  leading,
  trailing,
  fill,
  active = false,
  onClick,
  className,
  children,
  ...rest
}: {
  leading?: ReactNode;
  trailing?: ReactNode;
  fill?: ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<"div">, "onClick">) {
  const container = cx(
    "relative flex min-h-[26px] w-full items-center border-b border-(--ui-stroke-quaternary) last:border-0",
    Boolean(fill) && "overflow-hidden",
    active && "bg-(--ui-row-active-background)",
    onClick &&
      !active &&
      "transition-colors hover:bg-(--ui-row-hover-background)",
    className,
  );
  // The padded content row sits above the fill; padding lives here so the fill spans the row edge to edge.
  const row = "relative flex w-full items-center gap-2 px-3 text-left";
  if (onClick) {
    return (
      <div role="listitem" className={container}>
        {fill}
        <button
          type="button"
          onClick={onClick}
          className={cx(row, focusRingInset)}
          {...(rest as ComponentPropsWithoutRef<"button">)}
        >
          {leading}
          {children}
          {trailing}
        </button>
      </div>
    );
  }
  return (
    <div role="listitem" className={container} {...rest}>
      {fill}
      <span className={row}>
        {leading}
        {children}
        {trailing}
      </span>
    </div>
  );
}

/** The right-aligned metric cluster shared by every dock row. */
export function MetricRack({ children }: { children: ReactNode }) {
  return (
    <span className="flex shrink-0 items-center gap-3 font-mono text-label tabular-nums">
      {children}
    </span>
  );
}

/** One right-aligned mono metric. `unit`, when present, renders dimmed after the value so the number
 *  leads regardless of the value's own tone. `width` fixes the column so values line up down the panel. */
export function MetricCell({
  width,
  tone = "text-(--ui-text-tertiary)",
  unit,
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<"span"> & {
  width?: string;
  tone?: string;
  unit?: string;
}) {
  return (
    <span
      className={cx(
        "shrink-0 text-right font-mono text-label tabular-nums",
        width,
        tone,
        className,
      )}
      {...rest}
    >
      {children}
      {unit && <span className="ml-0.5 text-(--ui-text-tertiary)">{unit}</span>}
    </span>
  );
}
