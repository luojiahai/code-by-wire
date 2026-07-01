import { cx } from "../../ui/atoms";
import { Icon } from "../../ui/icons";
import { useCopyFlash } from "../../ui/use-copy-flash";

/**
 * Copy-to-clipboard affordance shared by code blocks and assistant bubbles. Built on the shared
 * `useCopyFlash` hook so the copy path and the flash duration match every other copy button in the UI.
 * The icon always shows; pass `label` to add text beside it. The consumer controls the button's own
 * visibility (e.g. an opacity reveal on parent group hover) through `className`.
 */
export function CopyButton({
  text,
  label,
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const { copied, copy } = useCopyFlash(text);

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : "Copy"}
      className={cx(
        "flex items-center gap-1.5 rounded-md px-1.5 py-1 text-meta text-fg-faint transition-colors hover:text-fg",
        className,
      )}
    >
      <Icon
        name={copied ? "check" : "copy"}
        size={12}
        className={copied ? "text-ok" : undefined}
      />
      {label && (
        <span className={cx(copied && "text-ok")}>
          {copied ? "Copied" : label}
        </span>
      )}
    </button>
  );
}
