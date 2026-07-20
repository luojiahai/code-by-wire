import { useEffect, useState } from "react";
import type { ToolEvent, ToolResultDetail } from "@shared/transcript";
import { ModalCloseButton } from "../ui/ModalCloseButton";
import { ModalShell } from "../ui/ModalShell";
import { Icon } from "../ui/icons";
import { OverlayScroll } from "../ui/OverlayScroll";
import { cx } from "../ui/atoms";
import { useI18n } from "../i18n";
import { toolIcon } from "./tool-icon";
import { AnsiLine } from "./panels/AnsiLine";
import { turnStatus } from "./turn-status";
import { POLL_MS } from "./use-polled-read";
import { useCopyFlash } from "../ui/use-copy-flash";

type Loaded = Extract<ToolResultDetail, { found: true }>;
type FetchState =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "ready"; detail: Loaded };

/** The detail modal for one tool turn: a pinned command bar (with copy) and the complete output rendered
 *  with ANSI color. The header renders instantly from the row event; command, output, and the
 *  authoritative status are fetched on open via getToolResult and re-polled while the call is still
 *  running, so an open modal fills in when its tool finishes. No output cap — the body scrolls. */
export function ToolResultModal({
  sessionId,
  agentId,
  tool,
  onClose,
}: {
  sessionId: string;
  agentId?: string;
  tool: ToolEvent;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<FetchState>({ phase: "loading" });

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setState({ phase: "loading" });
    const tick = () => {
      window.api
        .getToolResult(sessionId, tool.toolUseId, agentId)
        .then((r) => {
          if (!live) return;
          if (!r.found) {
            setState({ phase: "error" });
            return;
          }
          setState({ phase: "ready", detail: r });
          // The call was still running when we read it; re-poll so its output and final status fill in
          // while the modal stays open, instead of freezing on the open-time snapshot.
          if (r.status === "pending") timer = setTimeout(tick, POLL_MS);
        })
        .catch(() => {
          if (live) setState({ phase: "error" });
        });
    };
    tick();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId, agentId, tool.toolUseId]);

  // Status comes from the fetched result once loaded — it's the on-disk truth and outlives the row
  // event's status, which is a poll behind. Fall back to the row's status only while the first read is
  // in flight.
  const status = turnStatus(
    state.phase === "ready" ? state.detail.status : tool.status,
    t,
  );
  const command = state.phase === "ready" ? state.detail.command : tool.input;
  const cmd = useCopyFlash(command);
  const out = useCopyFlash(state.phase === "ready" ? state.detail.output : "");

  return (
    <ModalShell
      labelledBy="tool-result-title"
      widthClass="w-[44rem] max-w-[92vw]"
      contentOverflow="hidden"
      onClose={onClose}
    >
      <div
        id="tool-result-title"
        className="mb-3 flex items-center gap-2 text-aux"
      >
        <Icon
          name={toolIcon(tool.name)}
          size={14}
          className="shrink-0 text-primary-bright"
        />
        <span className="font-medium text-primary-bright">{tool.name}</span>
        <span className="text-ink-700">·</span>
        <span className={cx("font-mono", status.tone)}>
          {status.char} {status.label}
        </span>
      </div>

      <div className="rounded-md border border-ink-800 bg-well px-3 py-2 font-mono text-meta">
        <OverlayScroll
          axis="both"
          contentClassName="flex max-h-40 items-start gap-2"
        >
          <span
            aria-hidden
            data-selectable-text="false"
            className="shrink-0 text-fg-faint"
          >
            $
          </span>
          <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words text-fg">
            {command}
          </pre>
        </OverlayScroll>
      </div>
      <div className="mt-2 flex">
        <button
          type="button"
          disabled={state.phase !== "ready"}
          onClick={cmd.copy}
          className={cx(
            "rounded-sm border px-2 py-0.5 text-label transition-colors disabled:opacity-40",
            cmd.copied
              ? "border-ink-600 text-fg"
              : "border-ink-700 text-fg-muted hover:border-ink-600 hover:text-fg",
          )}
        >
          {cmd.copied ? t.common.copied : t.common.copy}
        </button>
      </div>

      <div className="mb-1 mt-4 text-label uppercase tracking-wider text-fg-faint">
        {t.modals.detail.output}
      </div>
      <OverlayScroll
        axis="both"
        className="rounded-md border border-ink-800 bg-well"
        contentClassName="max-h-[min(60vh,calc(100vh-25rem))] p-3 font-mono text-meta leading-relaxed text-fg-muted"
      >
        {state.phase === "loading" && (
          <span className="text-fg-faint">{t.modals.toolResult.loading}</span>
        )}
        {state.phase === "error" && (
          <span className="text-fg-faint">{t.modals.toolResult.loadError}</span>
        )}
        {state.phase === "ready" &&
          (state.detail.output === "" ? (
            <span className="text-fg-faint">
              {state.detail.status === "pending"
                ? t.modals.toolResult.runningNoOutput
                : t.transcript.toolNoOutput}
            </span>
          ) : (
            state.detail.output
              .replace(/\n$/, "")
              .split("\n")
              .map((line, i) => <AnsiLine key={i} text={line} />)
          ))}
      </OverlayScroll>

      <div className="mt-3 flex items-center gap-2 text-label text-fg-faint">
        <button
          type="button"
          disabled={state.phase !== "ready" || state.detail.output === ""}
          onClick={out.copy}
          className={cx(
            "rounded-sm border px-2 py-0.5 transition-colors disabled:opacity-40",
            out.copied
              ? "border-ink-600 text-fg"
              : "border-ink-700 text-fg-muted hover:border-ink-600 hover:text-fg",
          )}
        >
          {out.copied ? t.common.copied : t.modals.toolResult.copyOutput}
        </button>
        <div className="ml-auto">
          <ModalCloseButton onClose={onClose} />
        </div>
      </div>
    </ModalShell>
  );
}
