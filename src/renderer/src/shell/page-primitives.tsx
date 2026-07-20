import type { ReactNode } from "react";
import { cx } from "../ui/atoms";

/**
 * A page-level title block: heading + optional lede paragraph + optional right-aligned controls
 * cluster. Shared by Settings and New Session so both read as the same design system rather than
 * two independent one-offs.
 */
export function PageHeader({
  title,
  lede,
  right,
}: {
  title: string;
  lede?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-heading font-semibold tracking-tight text-fg">
          {title}
        </h1>
        {lede && (
          <p className="max-w-[54ch] text-body leading-relaxed text-fg-muted">
            {lede}
          </p>
        )}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

/** A titled, bordered card. Supplies no body padding of its own — callers pad their own content
 *  (e.g. a `Row`-based list self-pads each row; a form wraps in its own `p-4`). */
export function Card({
  title,
  children,
  overflowVisible = false,
}: {
  title: string;
  children: ReactNode;
  overflowVisible?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-xl border border-ink-800 bg-ink-925",
        overflowVisible ? "overflow-visible" : "overflow-hidden",
      )}
    >
      <div className="border-b border-ink-850 px-4 py-2.5 font-display text-label font-semibold uppercase tracking-[0.1em] text-fg-faint">
        {title}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}
