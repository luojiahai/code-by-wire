import { cx, focusRing } from "./atoms";
import { Icon, type IconName } from "./icons";

/** One tab in a {@link Tabs} bar. */
export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** Optional leading glyph (the center column's Terminal/Transcript tabs). */
  icon?: IconName;
  /** Optional trailing count badge (the dock's Tasks/Subagents/Shells/Turns tabs). */
  count?: number;
}

/** The two tab looks: `underline` for the primary view switch (center column), `lozenge` for the
 *  utility dock. Both are trackless — the old bordered pill is retired. */
export type TabsVariant = "underline" | "lozenge";

/** Per-variant class sets: a shared `base` shape plus the `active`/`idle` tone deltas, so a shape tweak
 *  lands in one string and the two states can't drift. */
const VARIANT_CLASSES: Record<
  TabsVariant,
  { base: string; active: string; idle: string }
> = {
  lozenge: {
    base: "rounded-sm px-2.5 py-1",
    active: "bg-ink-900 font-medium text-fg",
    idle: "text-fg-faint hover:text-fg",
  },
  underline: {
    base: "-mb-px border-b-2 px-3",
    active: "border-primary font-medium text-fg",
    idle: "border-transparent text-fg-faint hover:text-fg",
  },
};

/**
 * The app's tab control. One primitive, two variants so the center column's Terminal/Transcript switch
 * and the Structure dock's tab bar share their icon/count/selection logic while reading distinct by role.
 * Each tab can carry a leading icon, a trailing count, or both.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  variant,
}: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  variant: TabsVariant;
}) {
  const look = VARIANT_CLASSES[variant];
  return (
    <div
      className={cx(
        variant === "lozenge"
          ? "inline-flex items-center gap-0.5"
          : "flex items-stretch",
      )}
    >
      {tabs.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-pressed={active}
            className={cx(
              "inline-flex items-center gap-1.5 text-aux transition-colors",
              focusRing,
              look.base,
              active ? look.active : look.idle,
            )}
          >
            {t.icon && <Icon name={t.icon} size={13} />}
            {t.label}
            {t.count !== undefined && (
              <span className="font-mono text-label tabular-nums text-fg-faint">
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
