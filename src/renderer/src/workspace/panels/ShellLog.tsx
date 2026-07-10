import type { ShellOutput } from "@shared/types";
import { truncLabel } from "./shell-view";
import { AnsiLine } from "./AnsiLine";
import { OverlayScroll } from "../../ui/OverlayScroll";

/** A shell's full output: a source banner (live vs snapshot), an optional truncation note, then the log
 *  rendered with ANSI color. A pure renderer of the `output` it's handed (the poll lives in the hook). */
export function ShellLog({
  output,
}: {
  output: ShellOutput | null | undefined;
}) {
  // undefined = the first poll is still in flight; null = the shell captured no output. The header above
  // already carries the command + status, so the null case is a calm note, not a dead end.
  if (output === undefined)
    return (
      <div className="flex h-full items-center justify-center text-aux text-fg-faint">
        Reading output…
      </div>
    );
  if (output === null)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
        <div className="text-heading text-ink-700" aria-hidden>
          ⌁
        </div>
        <div className="text-aux text-fg-muted">No output</div>
        <div className="text-meta text-fg-faint">
          Command produced no stdout or stderr.
        </div>
      </div>
    );
  const trunc = truncLabel(output.truncatedBytes);
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-ink-850 px-4 py-1.5 text-label uppercase tracking-wider">
        <span
          className={
            output.source === "live" ? "text-primary" : "text-fg-faint"
          }
        >
          {output.source === "live" ? "● live output" : "snapshot"}
        </span>
        {trunc && <span className="ml-auto text-accent">{trunc}</span>}
      </div>
      <OverlayScroll
        axis="both"
        className="min-h-0 flex-1 bg-well"
        contentClassName="p-4 font-mono text-meta leading-relaxed text-fg-muted"
      >
        {output.text.split("\n").map((line, i) => (
          <AnsiLine key={i} text={line} />
        ))}
      </OverlayScroll>
    </div>
  );
}
