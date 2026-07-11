import type { BackgroundShell } from "@shared/types";
import { ModalShell } from "../ui/ModalShell";
import { OverlayScroll } from "../ui/OverlayScroll";
import { cx } from "../ui/atoms";
import { AnsiLine } from "./panels/AnsiLine";
import { shellDetailMeta, truncLabel } from "./panels/shell-view";
import type { ShellOutputState } from "./use-shell-output";

/** The Shell details modal: a "Shell details" title over Status / Runtime / Command / Output rows. A pure
 *  renderer — the live shell and its output poll are lifted to WorkspaceBody (like ShellDrill was), so this
 *  is a dumb view built on ModalShell's chrome, exactly like ToolResultModal / DiffModal. Escape,
 *  overlay-click, and the focus-trap come from ModalShell. Always read-only; cbw never controls a shell. */
export function ShellDetailModal({
  shell,
  output,
  now,
  onClose,
}: {
  shell: BackgroundShell;
  output: ShellOutputState;
  now: number;
  onClose: () => void;
}) {
  const meta = shellDetailMeta(shell, now);
  return (
    <ModalShell
      labelledBy="shell-detail-title"
      widthClass="w-[40rem] max-w-[92vw]"
      onClose={onClose}
    >
      <div
        id="shell-detail-title"
        className="mb-4 text-subhead font-semibold text-fg"
      >
        Shell details
      </div>

      <div className="grid grid-cols-[max-content_1fr] items-start gap-x-4 gap-y-3">
        <div className="text-meta text-fg-muted">Status</div>
        <div className={cx("font-mono text-meta", meta.statusTone)}>
          <span aria-hidden>{meta.statusGlyph}</span> {meta.statusText}
        </div>

        <div className="text-meta text-fg-muted">Runtime</div>
        <div className="font-mono text-meta tabular-nums text-fg">
          {meta.runtime}
        </div>

        <div className="text-meta text-fg-muted">Command</div>
        <div className="max-h-40 overflow-auto rounded-md border border-ink-800 bg-well px-3 py-2 font-mono text-meta">
          <span className="break-all text-fg">
            <span className="text-primary">$</span> {shell.command}
          </span>
        </div>

        <div className="text-meta text-fg-muted">Output</div>
        <ShellOutputBox output={output} />
      </div>

      <div className="mt-4 text-right text-label text-fg-faint">
        Esc to close
      </div>
    </ModalShell>
  );
}

/** The Output cell: the byte-bounded log with ANSI color, or a calm one-liner while the first poll is in
 *  flight (undefined) or when the shell captured nothing (null). No live/snapshot banner. */
function ShellOutputBox({ output }: { output: ShellOutputState }) {
  if (output === undefined)
    return (
      <div className="rounded-md border border-ink-800 bg-well px-3 py-2 text-meta text-fg-faint">
        Reading output…
      </div>
    );
  if (output === null)
    return (
      <div className="rounded-md border border-ink-800 bg-well px-3 py-2 text-meta text-fg-faint">
        No output available
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
