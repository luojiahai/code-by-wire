import { cx, focusRing } from "./atoms";
import { Icon, type IconName } from "./icons";

/** One tab in a {@link Tabs} bar. */
export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** Optional leading glyph. */
  icon?: IconName;
  /** Optional trailing count badge (the Activity dock's Tasks/Subagents/Shells tabs). */
  count?: number;
}

/**
 * The app's tab control: a single trackless underline switcher (active = a 2px rule under the label,
 * pulled down 1px to sit on the bar's own border). The Activity dock is its sole consumer. Each tab can
 * carry a leading icon, a trailing count, or both.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex items-stretch">
      {tabs.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-pressed={active}
            className={cx(
              "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 text-aux transition-colors",
              focusRing,
              active
                ? "border-(--ui-text-primary) font-medium text-(--ui-text-primary)"
                : "border-transparent text-(--ui-text-tertiary) hover:text-(--ui-text-primary)",
            )}
          >
            {t.icon && <Icon name={t.icon} size={13} />}
            {t.label}
            {t.count !== undefined && (
              <span className="font-mono text-label tabular-nums text-(--ui-text-quaternary)">
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
