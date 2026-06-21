import { Icon } from "./icons";
import { cx } from "./atoms";
import { useCopyFlash } from "./use-copy-flash";

/** A small icon button that copies `value` to the clipboard and flashes a check for ~1.2s. Used in the
 *  Git popover for the branch and the commit sha. `label` is the accessible name and resting tooltip. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const { copied, copy } = useCopyFlash(value);
  return (
    <button
      type="button"
      aria-label={label}
      title={copied ? "Copied" : label}
      onClick={copy}
      className={cx(
        "inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded border transition-colors",
        copied
          ? "border-ink-700 text-fg"
          : "border-ink-800 text-fg-faint hover:border-ink-700 hover:text-fg",
      )}
    >
      <Icon name={copied ? "check" : "copy"} size={10} />
    </button>
  );
}
