import type { BackgroundShell } from "@shared/types";
import { ModalCloseButton } from "../ui/ModalCloseButton";
import { ModalShell } from "../ui/ModalShell";
import { cx } from "../ui/atoms";
import { useI18n } from "../i18n";
import { shellDetailMeta } from "./panels/shell-view";
import type { ShellOutputState } from "./use-shell-output";
import { OutputBox } from "./OutputBox";

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
  const { t } = useI18n();
  const meta = shellDetailMeta(shell, now);
  return (
    <ModalShell
      labelledBy="shell-detail-title"
      widthClass="w-[40rem] max-w-[92vw]"
      contentOverflow="hidden"
      onClose={onClose}
    >
      <div
        id="shell-detail-title"
        className="mb-4 text-subhead font-semibold text-fg"
      >
        {t.modals.shellTitle}
      </div>

      <div className="grid grid-cols-[max-content_1fr] items-start gap-x-4 gap-y-3">
        <div className="text-meta text-fg-muted">{t.modals.detail.status}</div>
        <div className={cx("font-mono text-meta", meta.statusTone)}>
          <span aria-hidden>{meta.statusGlyph}</span> {meta.statusText}
        </div>

        <div className="text-meta text-fg-muted">{t.modals.detail.runtime}</div>
        <div className="font-mono text-meta tabular-nums text-fg">
          {meta.runtime}
        </div>

        <div className="text-meta text-fg-muted">{t.modals.detail.command}</div>
        <div className="flex max-h-40 items-start gap-2 overflow-auto rounded-md border border-ink-800 bg-well px-3 py-2 font-mono text-meta">
          <span
            aria-hidden
            data-selectable-text="false"
            className="shrink-0 text-fg-faint"
          >
            $
          </span>
          <span className="min-w-0 break-all text-fg">{shell.command}</span>
        </div>

        <div className="text-meta text-fg-muted">{t.modals.detail.output}</div>
        <OutputBox output={output} />
      </div>

      <div className="mt-4 text-right text-label text-fg-faint">
        <ModalCloseButton onClose={onClose} />
      </div>
    </ModalShell>
  );
}
