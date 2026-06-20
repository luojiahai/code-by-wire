import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { cx } from "./atoms";

/** A small icon button that copies `value` to the clipboard and flashes a check for ~1.2s. Used in the
 *  Git popover for the branch and the commit sha. `label` is the accessible name and resting tooltip. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <button
      type="button"
      aria-label={label}
      title={copied ? "Copied" : label}
      onClick={() => {
        void window.api.clipboardWriteText(value);
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1200);
      }}
      className={cx(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
        copied
          ? "border-ink-700 text-fg"
          : "border-ink-800 text-fg-faint hover:border-ink-700 hover:text-fg",
      )}
    >
      <Icon name={copied ? "check" : "copy"} size={10} />
    </button>
  );
}
