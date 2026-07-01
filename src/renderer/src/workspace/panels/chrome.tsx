import { type ReactNode } from "react";
import { InfoButton } from "../../ui/InfoButton";

// Shared chrome for the workspace rail panels and the Structure dock, so a retone lands in one place.

/** A dock tab body's empty state: faint, small, padded to the tab's content inset. Shared by the Turns
 *  and Subagents tabs so their "No X yet." lines stay identical. */
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-4 py-3 text-meta text-fg-faint">{children}</p>;
}

/** A rail panel's shell: vertical rhythm, a bottom hairline, and bottom padding. */
export function PanelSection({ children }: { children: ReactNode }) {
  return (
    <section className="space-y-2 border-b border-ink-800 pb-3.5 last:border-0">
      {children}
    </section>
  );
}

/**
 * A panel's small uppercase eyebrow heading. With no `info`/`right` it is the bare h2 (unchanged for the
 * Git/Tasks/Subagent panels). With either, it becomes the panel's full-width header strip: the heading
 * (plus an optional info button) on the left, an optional `right` slot (a total or a badge) on the right.
 * When `info` is set the info button reveals a description popover on hover or keyboard focus — scoped to
 * the button alone (its own `group`), so hovering the heading text or the `right` slot never triggers it.
 * The popover anchors to the strip, so it spans the full width and drops downward below the strip.
 */
export function PanelHeading({
  children,
  info,
  right,
}: {
  children: ReactNode;
  info?: ReactNode;
  right?: ReactNode;
}) {
  if (!info && !right) {
    return (
      <h2 className="font-display text-micro font-semibold uppercase tracking-[0.1em] text-fg-faint">
        {children}
      </h2>
    );
  }
  const title = typeof children === "string" ? children : undefined;
  return (
    <div className="relative flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5">
        <h2 className="font-display text-micro font-semibold uppercase tracking-[0.1em] text-fg-faint">
          {children}
        </h2>
        {info && (
          // The popover is absolute against this outer relative strip, so left-0/right-0 span its full
          // width and top-full drops it below the strip.
          <InfoButton
            label={title ? `About ${title}` : "About this metric"}
            popoverClassName="left-0 right-0 top-full mt-1.5 rounded-md border border-ink-700 bg-ink-900 px-2.5 py-2 text-meta leading-snug text-fg-muted shadow-lg"
          >
            {info}
          </InfoButton>
        )}
      </span>
      {right}
    </div>
  );
}
