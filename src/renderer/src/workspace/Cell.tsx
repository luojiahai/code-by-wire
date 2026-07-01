import type { ReactNode } from "react";
import { cx } from "../ui/atoms";

/** One annunciator cell: an Inter placard label over a mono readout. `led` adds a status lamp before the
 *  value (pulsing for live states); `seam` draws the divider between the status lamps and the readouts;
 *  `raw` drops the default value wrapper so the cell lays out its own value (the Git cell renders its own
 *  trigger + popover). */
export function Cell({
  label,
  led,
  ledPulse,
  valueClass,
  grow,
  seam,
  raw,
  title,
  children,
}: {
  label: string;
  led?: string;
  ledPulse?: boolean;
  valueClass?: string;
  grow?: number;
  seam?: boolean;
  raw?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div
      title={title}
      style={{ flex: grow ?? 1 }}
      className={cx(
        "flex min-w-0 flex-col gap-[3px] border-r border-ink-850 px-3 py-1.5 last:border-r-0",
        seam && "border-l border-ink-800",
      )}
    >
      <span className="font-display text-micro font-semibold uppercase tracking-[0.1em] text-fg-faint">
        {label}
      </span>
      <span
        className={cx(
          "flex min-w-0 items-center gap-1.5 font-mono text-aux",
          valueClass ?? "text-fg",
        )}
      >
        {led && (
          <span
            className={cx(
              "h-[7px] w-[7px] shrink-0 rounded-full",
              led,
              ledPulse && "animate-pulse-soft",
            )}
          />
        )}
        {raw ? children : <span className="min-w-0">{children}</span>}
      </span>
    </div>
  );
}
