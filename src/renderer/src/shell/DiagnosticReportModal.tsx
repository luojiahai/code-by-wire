import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { DiagnosticReportResult } from "@shared/diagnostic-report";
import { useI18n } from "../i18n";
import { ModalCloseButton } from "../ui/ModalCloseButton";
import { ModalShell } from "../ui/ModalShell";
import { OverlayScroll } from "../ui/OverlayScroll";
import { cx } from "../ui/atoms";
import { Icon } from "../ui/icons";

type ReadyReport = Extract<DiagnosticReportResult, { ok: true }>;
type LoadState =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "ready"; report: ReadyReport };

export function DiagnosticReportModal({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFeedbackLater = useCallback(() => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => {
      setCopyState("idle");
      setSaveState((current) => (current === "saving" ? current : "idle"));
    }, 1200);
  }, []);

  useEffect(
    () => () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    },
    [],
  );

  useEffect(() => {
    let live = true;
    setState({ phase: "loading" });
    setCopyState("idle");
    setSaveState("idle");
    window.api
      .diagnosticReport(sessionId)
      .then((result) => {
        if (!live) return;
        setState(
          result.ok ? { phase: "ready", report: result } : { phase: "error" },
        );
      })
      .catch(() => {
        if (live) setState({ phase: "error" });
      });
    return () => {
      live = false;
    };
  }, [sessionId, attempt]);

  const report = state.phase === "ready" ? state.report : null;
  const saving = saveState === "saving";

  async function copy(): Promise<void> {
    if (!report) return;
    try {
      await window.api.clipboardWriteText(report.markdown);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    clearFeedbackLater();
  }

  async function download(): Promise<void> {
    if (!report || saving) return;
    setSaveState("saving");
    try {
      const result = await window.api.saveDiagnosticReport(
        report.fileName,
        report.markdown,
      );
      if (!result.ok) setSaveState("error");
      else if (result.status === "saved") setSaveState("saved");
      else setSaveState("idle");
    } catch {
      setSaveState("error");
    }
    clearFeedbackLater();
  }

  const actionError =
    copyState === "error"
      ? t.modals.diagnostic.copyError
      : saveState === "error"
        ? t.modals.diagnostic.saveError
        : null;

  return (
    <ModalShell
      labelledBy={titleId}
      widthClass="w-[44rem] max-w-[92vw]"
      closeDisabled={saving}
      onClose={onClose}
    >
      <div className="mb-3">
        <div id={titleId} className="text-subhead font-semibold text-fg">
          {t.modals.diagnostic.title}
        </div>
        <p className="mt-1 text-label text-fg-faint">
          {t.modals.diagnostic.privacy}
        </p>
      </div>

      {state.phase === "loading" && (
        <div className="flex min-h-48 items-center justify-center gap-2 rounded-md border border-ink-800 bg-well text-aux text-fg-faint">
          <Icon name="loader-circle" size={15} className="animate-spin" />
          {t.modals.diagnostic.loading}
        </div>
      )}

      {state.phase === "error" && (
        <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-md border border-ink-800 bg-well text-aux text-fg-faint">
          <Icon name="triangle-alert" size={18} className="text-danger" />
          <span>{t.modals.diagnostic.loadError}</span>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="rounded-sm border border-ink-700 px-2 py-0.5 text-fg-muted transition-colors hover:border-ink-600 hover:text-fg"
          >
            {t.modals.diagnostic.retry}
          </button>
        </div>
      )}

      {report && (
        <OverlayScroll
          axis="both"
          className="rounded-md border border-ink-800 bg-well"
          contentClassName="max-h-[min(60vh,calc(100vh-14rem))] p-3"
        >
          <pre className="whitespace-pre font-mono text-meta leading-relaxed text-fg-muted">
            {report.markdown}
          </pre>
        </OverlayScroll>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-label">
        {report && (
          <>
            <button
              type="button"
              disabled={saving}
              onClick={() => void download()}
              className={cx(
                "rounded-sm border px-2 py-0.5 transition-colors disabled:opacity-40",
                saveState === "saved"
                  ? "border-ink-600 text-fg"
                  : "border-ink-700 text-fg-muted hover:border-ink-600 hover:text-fg",
              )}
            >
              {saving
                ? t.modals.diagnostic.saving
                : saveState === "saved"
                  ? t.modals.diagnostic.saved
                  : t.modals.diagnostic.download}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void copy()}
              className={cx(
                "rounded-sm border px-2 py-0.5 transition-colors disabled:opacity-40",
                copyState === "copied"
                  ? "border-ink-600 text-fg"
                  : "border-ink-700 text-fg-muted hover:border-ink-600 hover:text-fg",
              )}
            >
              {copyState === "copied" ? t.common.copied : t.common.copy}
            </button>
          </>
        )}
        <span role="alert" aria-live="polite" className="text-danger">
          {actionError}
        </span>
        <div className="ml-auto">
          <ModalCloseButton onClose={onClose} disabled={saving} />
        </div>
      </div>
    </ModalShell>
  );
}
