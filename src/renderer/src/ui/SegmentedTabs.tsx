import { cx } from "./atoms";
import { Icon, type IconName } from "./icons";

/** One segment in a {@link SegmentedTabs} pill. */
export interface SegmentTab<T extends string> {
  id: T;
  label: string;
  /** Optional leading glyph (the center column's Terminal/Transcript toggle). */
  icon?: IconName;
  /** Optional trailing count badge (the Structure dock's Turns/Subagents tabs). */
  count?: number;
}

/**
 * The app's segmented control: a well-track pill of buttons, the active one raised. Shared by the center
 * column's Terminal/Transcript toggle and the Structure dock's tab bar so the two never drift. Each tab
 * can carry a leading icon, a trailing count, or both.
 */
export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: SegmentTab<T>[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-ink-800 bg-well p-0.5">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          aria-pressed={value === t.id}
          className={cx(
            "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px] transition-colors",
            value === t.id
              ? "bg-ink-900 font-semibold text-fg"
              : "text-fg-muted hover:text-fg",
          )}
        >
          {t.icon && <Icon name={t.icon} size={13} />}
          {t.label}
          {t.count !== undefined && (
            <span className="font-mono text-[10px] tabular-nums text-fg-faint">
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
