import { useEffect, useState } from "react";
import type { ToolEvent, ToolResultDetail } from "@shared/transcript";
import { ModalShell } from "../ui/ModalShell";
import { Icon } from "../ui/icons";
import { cx } from "../ui/atoms";
import { toolIcon } from "./tool-icon";
import { ansiToSpans } from "./panels/ansi-to-html";
import { ansiClass } from "./panels/shell-view";

type Loaded = Extract<ToolResultDetail, { found: true }>;
type FetchState =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "ready"; detail: Loaded };

const STATUS_LABEL: Record<
  ToolEvent["status"],
  { text: string; tone: string }
> = {
  ok: { text: "✓ passed", tone: "text-ok" },
  error: { text: "✕ failed", tone: "text-danger" },
  pending: { text: "running", tone: "text-working-bright" },
};

/** One output line's ANSI spans, mirroring ShellLog's Line so the command's own colors come through. */
function OutLine({ text }: { text: string }) {
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

/** The detail modal for one tool turn: a pinned command bar (with copy) and the complete output rendered
 *  with ANSI color. Header + status render instantly from the row event; the command and output are
 *  fetched on open via getToolResult. No output cap — the body scrolls. */
export function ToolResultModal({
  sessionId,
  tool,
  onClose,
}: {
  sessionId: string;
  tool: ToolEvent;
  onClose: () => void;
}) {
  const [state, setState] = useState<FetchState>({ phase: "loading" });

  useEffect(() => {
    let live = true;
    setState({ phase: "loading" });
    window.api
      .getToolResult(sessionId, tool.toolUseId)
      .then((r) => {
        if (!live) return;
        setState(r.found ? { phase: "ready", detail: r } : { phase: "error" });
      })
      .catch(() => {
        if (live) setState({ phase: "error" });
      });
    return () => {
      live = false;
    };
  }, [sessionId, tool.toolUseId]);

  const status = STATUS_LABEL[tool.status];
  const command = state.phase === "ready" ? state.detail.command : tool.input;
  const copy = (text: string) => void window.api.clipboardWriteText(text);

  return (
    <ModalShell
      labelledBy="tool-result-title"
      widthClass="w-[44rem] max-w-[92vw]"
      onClose={onClose}
    >
      <div
        id="tool-result-title"
        className="mb-3 flex items-center gap-2 text-[12px]"
      >
        <Icon
          name={toolIcon(tool.name)}
          size={14}
          className="shrink-0 text-primary-bright"
        />
        <span className="font-semibold text-primary-bright">{tool.name}</span>
        <span className="text-ink-700">·</span>
        <span className={cx("font-mono", status.tone)}>{status.text}</span>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-ink-800 bg-well px-3 py-2 font-mono text-[11px]">
        <pre className="flex-1 whitespace-pre-wrap break-words text-fg">
          <span className="text-primary">$</span> {command}
        </pre>
        <button
          type="button"
          onClick={() => copy(command)}
          className="shrink-0 rounded border border-ink-700 px-2 py-0.5 text-[10px] text-fg-muted hover:border-ink-600 hover:text-fg"
        >
          Copy
        </button>
      </div>

      <div className="mb-1 mt-3 text-[10px] uppercase tracking-wider text-fg-faint">
        Output
      </div>
      <div className="max-h-[60vh] overflow-auto rounded-md border border-ink-800 bg-well p-3 font-mono text-[11px] leading-relaxed text-fg-muted">
        {state.phase === "loading" && (
          <span className="text-fg-faint">Loading output…</span>
        )}
        {state.phase === "error" && (
          <span className="text-fg-faint">Couldn't load output.</span>
        )}
        {state.phase === "ready" &&
          (state.detail.output === "" ? (
            <span className="text-fg-faint">
              {tool.status === "pending"
                ? "Running — no output yet."
                : "no output"}
            </span>
          ) : (
            state.detail.output
              .split("\n")
              .map((line, i) => <OutLine key={i} text={line} />)
          ))}
      </div>

      <div className="mt-3 flex items-center gap-2 text-[10px] text-fg-faint">
        <button
          type="button"
          disabled={state.phase !== "ready"}
          onClick={() => state.phase === "ready" && copy(state.detail.output)}
          className="rounded border border-ink-700 px-2 py-0.5 text-fg-muted hover:border-ink-600 hover:text-fg disabled:opacity-40"
        >
          Copy output
        </button>
        <span className="ml-auto">Esc to close</span>
      </div>
    </ModalShell>
  );
}
