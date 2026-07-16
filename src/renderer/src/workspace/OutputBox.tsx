import type { ShellOutputState } from "./use-shell-output";
import { OverlayScroll } from "../ui/OverlayScroll";
import { useI18n } from "../i18n";
import { AnsiLine } from "./panels/AnsiLine";
import { truncLabel } from "./panels/shell-view";

/** The Output cell shared by the Shell- and Monitor-details modals: the byte-bounded log with ANSI color,
 *  or a calm one-liner while the first poll is in flight (undefined) or when nothing was captured (null).
 *  No live/snapshot banner. */
export function OutputBox({ output }: { output: ShellOutputState }) {
  const { t } = useI18n();
  if (output === undefined)
    return (
      <div className="rounded-md border border-ink-800 bg-well px-3 py-2 text-meta text-fg-faint">
        {t.modals.outputBox.reading}
      </div>
    );
  if (output === null)
    return (
      <div className="rounded-md border border-ink-800 bg-well px-3 py-2 text-meta text-fg-faint">
        {t.modals.outputBox.unavailable}
      </div>
    );
  const trunc = truncLabel(output.truncatedBytes);
  return (
    <div className="min-w-0">
      {trunc && <div className="mb-1 text-label text-accent">{trunc}</div>}
      <OverlayScroll
        axis="both"
        className="rounded-md border border-ink-800 bg-well"
        contentClassName="max-h-[60vh] p-3 font-mono text-meta leading-relaxed text-fg-muted"
      >
        {output.text.split("\n").map((line, i) => (
          <AnsiLine key={i} text={line} />
        ))}
      </OverlayScroll>
    </div>
  );
}
