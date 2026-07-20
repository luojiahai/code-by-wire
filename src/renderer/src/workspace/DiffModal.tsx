import type { DiffEvent } from "@shared/transcript";
import { ModalCloseButton } from "../ui/ModalCloseButton";
import { ModalShell } from "../ui/ModalShell";
import { Icon } from "../ui/icons";
import { OverlayScroll } from "../ui/OverlayScroll";
import { cx } from "../ui/atoms";
import { useCopyFlash } from "../ui/use-copy-flash";
import { useI18n } from "../i18n";
import { toolIcon } from "./tool-icon";
import { turnStatus } from "./turn-status";
import { splitFilePath } from "./file-path";

/** The detail modal for one edit (Edit / Write / MultiEdit): a header with the tool, file, and change
 *  counts, then the full hunk as red removed / green added lines. The hunk is already on the event, so
 *  there is no fetch — the body just scrolls. */
export function DiffModal({
  diff,
  onClose,
}: {
  diff: DiffEvent;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const empty = diff.hunk.removed.length === 0 && diff.hunk.added.length === 0;
  const st = turnStatus(diff.status, t);
  const file = splitFilePath(diff.file);
  const patch = [
    ...diff.hunk.removed.map((l) => `- ${l}`),
    ...diff.hunk.added.map((l) => `+ ${l}`),
  ].join("\n");
  const { copied, copy } = useCopyFlash(patch);
  const pathCopy = useCopyFlash(diff.file);
  return (
    <ModalShell
      labelledBy="diff-title"
      widthClass="w-[44rem] max-w-[92vw]"
      contentOverflow="hidden"
      onClose={onClose}
    >
      <div id="diff-title" className="mb-3 max-h-[30vh] overflow-y-auto">
        <div className="flex items-center gap-2 text-aux">
          <Icon
            name={toolIcon(diff.tool)}
            size={14}
            className="shrink-0 text-primary-bright"
          />
          <span className="font-medium text-primary-bright">{diff.tool}</span>
          <span className="text-ink-700">·</span>
          <span className={cx("font-mono", st.tone)}>
            {st.char} {st.label}
          </span>
        </div>
        <div className="mt-2 flex items-start gap-2 rounded-md border border-ink-800 bg-well px-3 py-1.5 font-mono text-aux">
          <Icon
            name="folder"
            size={12}
            className="mt-0.5 shrink-0 text-fg-faint"
          />
          <span className="min-w-0 flex-1 break-all leading-relaxed">
            <span className="text-fg-faint">{file.dir}</span>
            <span className="text-fg">{file.name}</span>
          </span>
          <span className="mt-0.5 shrink-0 text-meta">
            <span className="text-ok">+{diff.hunk.added.length}</span>{" "}
            <span className="text-danger">−{diff.hunk.removed.length}</span>
          </span>
          <button
            type="button"
            onClick={pathCopy.copy}
            className={cx(
              "mt-0.5 shrink-0 rounded-sm border px-2 py-0.5 text-label transition-colors",
              pathCopy.copied
                ? "border-ink-600 text-fg"
                : "border-ink-700 text-fg-muted hover:border-ink-600 hover:text-fg",
            )}
          >
            {pathCopy.copied ? t.common.copied : t.modals.diff.copyPath}
          </button>
        </div>
      </div>

      <OverlayScroll
        axis="both"
        className="rounded-md border border-ink-800 bg-well"
        contentClassName="max-h-[min(60vh,calc(100vh-14rem))] p-3 font-mono text-meta leading-relaxed"
      >
        {empty ? (
          <span className="text-fg-faint">{t.modals.diff.noChanges}</span>
        ) : (
          <>
            {diff.hunk.removed.map((l, i) => (
              <div key={`r${i}`} className="whitespace-pre text-danger">
                - {l}
              </div>
            ))}
            {diff.hunk.added.map((l, i) => (
              <div key={`a${i}`} className="whitespace-pre text-ok">
                + {l}
              </div>
            ))}
          </>
        )}
      </OverlayScroll>

      <div className="mt-3 flex items-center gap-2 text-label text-fg-faint">
        <button
          type="button"
          onClick={copy}
          className={cx(
            "rounded-sm border px-2 py-0.5 transition-colors",
            copied
              ? "border-ink-600 text-fg"
              : "border-ink-700 text-fg-muted hover:border-ink-600 hover:text-fg",
          )}
        >
          {copied ? t.common.copied : t.modals.diff.copyDiff}
        </button>
        <div className="ml-auto">
          <ModalCloseButton onClose={onClose} />
        </div>
      </div>
    </ModalShell>
  );
}
