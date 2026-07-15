import { cx } from "./atoms";
import { Icon, type IconName } from "./icons";

export interface SegmentedSwitchOption<T extends string> {
  value: T;
  label: string;
  icon: IconName;
}

/**
 * A 2-(or-more)-way icon+label switcher. Same container and segment styling as the session
 * header's Claude Code / Transcript view switcher (MiddleHeader.tsx's ViewSegment), generalized
 * for reuse — that component stays private to the header; this is a fresh, generic sibling.
 * Clicking the already-active segment is a no-op.
 */
export function SegmentedSwitch<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegmentedSwitchOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex shrink-0 items-center rounded-sm border border-(--ui-stroke-tertiary) bg-[color-mix(in_srgb,var(--color-fg)_5%,transparent)] p-[2px]"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (!active) onChange(opt.value);
            }}
            className={cx(
              "flex h-4 items-center gap-1.5 rounded-xs px-2 text-[0.7rem] font-medium leading-none transition-colors duration-100",
              active
                ? "bg-(--ui-control-active-background) text-fg"
                : "text-(--ui-text-tertiary) hover:text-fg",
            )}
          >
            <Icon name={opt.icon} size={13} />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
