import { useEffect, useState } from "react";
import type { ToolEvent, ToolResultDetail } from "@shared/transcript";
import { ModalShell } from "../ui/ModalShell";
import { Icon } from "../ui/icons";
import { OverlayScroll } from "../ui/OverlayScroll";
import { cx } from "../ui/atoms";
import { toolIcon } from "./tool-icon";
import { AnsiLine } from "./panels/AnsiLine";
import { TURN_STATUS } from "./turn-status";
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
  const status =
    TURN_STATUS[state.phase === "ready" ? state.detail.status : tool.status];
  const command = state.phase === "ready" ? state.detail.command : tool.input;
  const cmd = useCopyFlash(command);
  const out = useCopyFlash(state.phase === "ready" ? state.detail.output : "");

  return (
    <ModalShell
      labelledBy="tool-result-title"
      widthClass="w-[44rem] max-w-[92vw]"
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

      <div className="flex items-start gap-2 rounded-md border border-ink-800 bg-well px-3 py-2 font-mono text-meta">
        <pre className="flex-1 whitespace-pre-wrap break-words text-fg">
          <span className="text-primary">$</span> {command}
        </pre>
        <button
          type="button"
          disabled={state.phase !== "ready"}
          onClick={cmd.copy}
          className={cx(
            "shrink-0 rounded-sm border px-2 py-0.5 text-label transition-colors disabled:opacity-40",
            cmd.copied
              ? "border-ink-600 text-fg"
              : "border-ink-700 text-fg-muted hover:border-ink-600 hover:text-fg",
          )}
        >
          {cmd.copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="mb-1 mt-3 text-label uppercase tracking-wider text-fg-faint">
        Output
      </div>
      <OverlayScroll
        axis="both"
        className="rounded-md border border-ink-800 bg-well"
        contentClassName="max-h-[60vh] p-3 font-mono text-meta leading-relaxed text-fg-muted"
      >
        {state.phase === "loading" && (
          <span className="text-fg-faint">Loading output…</span>
        )}
        {state.phase === "error" && (
          <span className="text-fg-faint">Couldn't load output.</span>
        )}
        {state.phase === "ready" &&
          (state.detail.output === "" ? (
            <span className="text-fg-faint">
              {state.detail.status === "pending"
                ? "Running — no output yet."
                : "no output"}
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
          {out.copied ? "Copied" : "Copy output"}
        </button>
        <span className="ml-auto">Esc to close</span>
      </div>
    </ModalShell>
  );
}
