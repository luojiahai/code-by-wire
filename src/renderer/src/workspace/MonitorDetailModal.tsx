import type { Monitor } from "@shared/types";
import { ModalCloseButton } from "../ui/ModalCloseButton";
import { ModalShell } from "../ui/ModalShell";
import { cx } from "../ui/atoms";
import { useI18n } from "../i18n";
import { monitorDetailMeta } from "./panels/monitor-view";
import type { ShellOutputState } from "./use-shell-output";
import { OutputBox } from "./OutputBox";

/** The Monitor details modal: a "Monitor details" title over Status / Runtime / Script / Output rows. A
 *  pure renderer — the live monitor and its output poll are lifted to Workspace (like the shell modal), so
 *  this is a dumb view on ModalShell's chrome. Always read-only; cbw never controls a monitor. */
export function MonitorDetailModal({
  monitor,
  output,
  now,
  onClose,
}: {
  monitor: Monitor;
  output: ShellOutputState;
  now: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const meta = monitorDetailMeta(monitor, now);
  return (
    <ModalShell
      labelledBy="monitor-detail-title"
      widthClass="w-[40rem] max-w-[92vw]"
      contentOverflow="hidden"
      onClose={onClose}
    >
      <div
        id="monitor-detail-title"
        className="mb-4 text-subhead font-semibold text-fg"
      >
        {t.modals.monitorTitle}
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

        <div className="text-meta text-fg-muted">{t.modals.detail.script}</div>
        <div className="max-h-40 overflow-auto rounded-md border border-ink-800 bg-well px-3 py-2 font-mono text-meta">
          <span className="break-all text-fg">{monitor.command}</span>
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
