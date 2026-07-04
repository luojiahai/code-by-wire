import type { ReactNode } from "react";
import { cx } from "../ui/atoms";
import { Icon, type IconName } from "../ui/icons";

/** Hermes's shared sidebar section label (their app/shell/sidebar-label.tsx): the 0.64rem
 *  uppercase overline, shared by the left sidebar's section header and the right rail's panel
 *  headings so the treatment can't drift. The leading glyph is the dither dot by default; a rail
 *  panel passes `icon` to wear its dedicated lucide glyph instead (Pressure's gauge, Spend's
 *  coins, …), in the label's own color so icon and title read as one unit. */
export function SidebarPanelLabel({
  children,
  className,
  icon,
}: {
  children: ReactNode;
  className?: string;
  icon?: IconName;
}) {
  return (
    <span
      className={cx(
        "flex min-w-0 items-center gap-1.5 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-(--theme-primary)",
        className,
      )}
    >
      {icon ? (
        <span className="grid size-3.5 shrink-0 place-items-center text-(--theme-primary)">
          <Icon name={icon} size={12} />
        </span>
      ) : (
        <span className="grid size-3.5 shrink-0 place-items-center">
          <span className="dither inline-block size-2 shrink-0 rounded-[1px]" />
        </span>
      )}
      <span className="min-w-0 truncate leading-none">{children}</span>
    </span>
  );
}
