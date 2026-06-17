import type { ShellOutput } from "@shared/types";
import { ansiToSpans } from "./ansi-to-html";
import { ansiClass, truncLabel } from "./shell-view";
import { cx } from "../../ui/atoms";

/** Render one log line's ANSI spans. */
function Line({ text }: { text: string }) {
  const spans = ansiToSpans(text);
  return (
    <div className="whitespace-pre-wrap break-words">
      {spans.length === 0
        ? " "
        : spans.map((s, i) => (
            <span
              key={i}
              className={cx(
                s.fg && ansiClass(s.fg, s.bright),
                s.bold && "font-semibold",
                s.dim && "opacity-60",
              )}
            >
              {s.text}
            </span>
          ))}
    </div>
  );
}

/** A shell's full output: a source banner (live vs snapshot), an optional truncation note, then the log
 *  rendered with ANSI color. A pure renderer of the `output` it's handed (the poll lives in the hook). */
export function ShellLog({
  output,
}: {
  output: ShellOutput | null | undefined;
}) {
  if (output === null)
    return (
      <div className="flex h-full items-center justify-center text-[12px] text-fg-faint">
        No output captured for this shell.
      </div>
    );
  const trunc = output ? truncLabel(output.truncatedBytes) : "";
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-ink-850 px-4 py-1.5 text-[10px] uppercase tracking-wider">
        <span
          className={
            output?.source === "live" ? "text-primary" : "text-fg-faint"
          }
        >
          {output?.source === "live" ? "● live output" : "snapshot"}
        </span>
        {trunc && <span className="ml-auto text-accent">{trunc}</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-well p-4 font-mono text-[11px] leading-relaxed text-fg-muted">
        {(output?.text ?? "").split("\n").map((line, i) => (
          <Line key={i} text={line} />
        ))}
      </div>
    </div>
  );
}
