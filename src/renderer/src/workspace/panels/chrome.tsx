import { type ReactNode } from "react";
import { InfoButton } from "../../ui/InfoButton";
import type { IconName } from "../../ui/icon-names";
import { SidebarPanelLabel } from "../../shell/SidebarPanelLabel";

// Shared chrome for the workspace rail panels and the Activity dock, so a retone lands in one place.

/** A dock tab body's empty state: faint, small, padded to the tab's content inset. Shared by the Turns
 *  and Subagents tabs so their "No X yet." lines stay identical. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="px-4 py-3 text-xs text-(--ui-text-quaternary)">{children}</p>
  );
}

/** A rail panel's shell: flat hermes section chrome — no divider borders of its own, just vertical
 *  rhythm. pt-1 balances pb-3 now that the cockpit rail draws hairlines between sections. */
export function PanelSection({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 px-2.5 pt-1 pb-3">
      {children}
    </section>
  );
}

/**
 * A panel's hermes section-header strip: the shared `SidebarPanelLabel` (uppercase overline with dither
 * dot) on the left, plus an optional info button, and an optional `right` slot (a total or a badge) on
 * the right. When `info`/`right` are absent the extra spans simply render empty. When `info` is set the
 * info button reveals a description popover on hover or keyboard focus — scoped to the button alone
 * (its own `group`), so hovering the heading text or the `right` slot never triggers it. The popover
 * anchors to the strip, so it spans the full width and drops downward below the strip.
 */
export function PanelHeading({
  children,
  info,
  right,
  icon,
}: {
  children: ReactNode;
  info?: ReactNode;
  right?: ReactNode;
  /** The panel's dedicated lucide glyph (cockpit rail); omitted, the label wears the dither dot. */
  icon?: IconName;
}) {
  const title = typeof children === "string" ? children : undefined;
  return (
    <div className="relative -mx-2.5 flex h-7 shrink-0 items-center justify-between gap-2 px-2.5">
      <span className="flex min-w-0 items-center gap-1.5">
        <h2 className="flex min-w-0 items-center">
          <SidebarPanelLabel icon={icon}>{children}</SidebarPanelLabel>
        </h2>
        {info && (
          // The popover is absolute against this outer relative strip, so left-0/right-0 span its full
          // width and top-full drops it below the strip.
          <InfoButton
            label={title ? `About ${title}` : "About this metric"}
            popoverClassName="left-0 right-0 top-full mt-1.5 rounded-md border border-(--ui-stroke-secondary) bg-[color-mix(in_srgb,var(--ui-bg-elevated)_96%,transparent)] px-2.5 py-2 text-xs leading-snug text-(--ui-text-secondary) shadow-(--shadow-md) backdrop-blur-xl"
          >
            {info}
          </InfoButton>
        )}
      </span>
      {right}
    </div>
  );
}
