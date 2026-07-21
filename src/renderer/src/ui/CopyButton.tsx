import { Icon } from "./icons";
import { cx } from "./atoms";
import { useCopyFlash } from "./use-copy-flash";
import { useI18n } from "../i18n";

/** A small icon button that copies `value` to the clipboard and flashes a check for ~1.2s. Used beside
 *  the Session panel's Branch readout and the Stats session-id column.
 *  `label` is the accessible name and resting tooltip (caller-supplied, already translated); only the
 *  transient "Copied" flash is owned here. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const { t } = useI18n();
  const { copied, copy } = useCopyFlash(value);
  return (
    <button
      type="button"
      aria-label={label}
      title={copied ? t.common.copied : label}
      onClick={copy}
      className={cx(
        "inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-sm border transition-colors",
        copied
          ? "border-ink-700 text-fg"
          : "border-ink-800 text-fg-faint hover:border-ink-700 hover:text-fg",
      )}
    >
      <Icon name={copied ? "check" : "copy"} size={10} />
    </button>
  );
}
