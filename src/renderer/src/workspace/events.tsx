import type { ReactNode } from "react";
import type { DiffEvent, ToolEvent, TranscriptEvent } from "@shared/transcript";
import { cx } from "../ui/atoms";
import { Icon } from "../ui/icons";
import { toolIcon } from "./tool-icon";
import { TURN_STATUS } from "./turn-status";
import type { DispatchDrill } from "./drill-index";
import { CopyButton } from "./markdown/CopyButton";
import { MarkdownMessage } from "./markdown/MarkdownMessage";

/** A request to open a detail modal for one transcript event. Threaded from the feed up to the view that
 *  owns the modal state. A discriminated union so the view renders the right modal. */
export type OpenDetail =
  | { kind: "tool"; tool: ToolEvent }
  | { kind: "diff"; diff: DiffEvent };

/** Render one transcript event. The switch is exhaustive over TranscriptEvent's kinds. */
export function EventItem({
  event,
  dispatchDrill,
  onOpen,
}: {
  event: TranscriptEvent;
  dispatchDrill?: DispatchDrill;
  onOpen?: (detail: OpenDetail) => void;
}) {
  switch (event.kind) {
    case "user":
      return <Bubble role="user">{event.text}</Bubble>;
    case "assistant":
      return (
        <div>
          <Bubble role="assistant">
            <MarkdownMessage text={event.text} />
          </Bubble>
          <div className="ml-[34px] mt-1">
            <CopyButton text={event.text} />
          </div>
        </div>
      );
    case "thinking":
      return <Thinking text={event.text} />;
    case "tool":
      return (
        <ToolCall
          tool={event}
          onOpen={
            onOpen ? () => onOpen({ kind: "tool", tool: event }) : undefined
          }
        />
      );
    case "diff":
      return (
        <DiffRow
          diff={event}
          onOpen={
            onOpen ? () => onOpen({ kind: "diff", diff: event }) : undefined
          }
        />
      );
    case "subagent": {
      // Local const so the membership check narrows dispatchDrill into the click closure (no `!`).
      const dd = dispatchDrill;
      const onDrill =
        dd && dd.index.has(event.toolUseId)
          ? () => dd.onDrill(event.toolUseId)
          : undefined;
      return (
        <SubagentDispatch
          agentType={event.agentType}
          description={event.description}
          onDrill={onDrill}
        />
      );
    }
  }
}

function Bubble({
  role,
  children,
}: {
  role: "user" | "assistant";
  children: ReactNode;
}) {
  const user = role === "user";
  return (
    <div className={cx("flex gap-2.5", user && "flex-row-reverse")}>
      <div
        role="img"
        aria-label={user ? "You" : "Claude"}
        title={user ? "You" : "Claude"}
        className={cx(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
          user
            ? "bg-ink-900 text-fg-muted"
            : "bg-primary/15 text-primary-bright",
        )}
      >
        <Icon name={user ? "circle-user" : "sparkles"} size={14} />
      </div>
      <div
        className={cx(
          "max-w-[85%] break-words rounded-xl px-3.5 py-2.5 text-body leading-relaxed",
          user
            ? "whitespace-pre-wrap bg-ink-900 text-fg"
            : "bg-ink-925 text-fg ring-1 ring-ink-800",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function Thinking({ text }: { text: string }) {
  return (
    <details className="ml-[34px] text-meta text-fg-faint">
      <summary className="cursor-pointer select-none">Thinking</summary>
      <p className="mt-1 whitespace-pre-wrap border-l border-ink-700 pl-2 leading-relaxed">
        {text}
      </p>
    </details>
  );
}

/** A one-line tool turn: a per-tool glyph, the tool name, the summarized input, then a status shape and
 *  the output size. When `onOpen` is given the whole row is a button (with a drill chevron) that opens
 *  the detail modal; without it the row is a plain, non-interactive line (the subagent drill view). */
function ToolCall({ tool, onOpen }: { tool: ToolEvent; onOpen?: () => void }) {
  const st = TURN_STATUS[tool.status];
  const size =
    tool.status === "pending"
      ? "running…"
      : tool.outputLines === 0
        ? "no output"
        : `${tool.outputLines} line${tool.outputLines === 1 ? "" : "s"}`;
  const base =
    "ml-[34px] max-w-[85%] flex items-center gap-2 rounded-lg border border-ink-800 bg-well px-3 py-1.5 font-mono text-meta";
  const body = (
    <>
      <Icon
        name={toolIcon(tool.name)}
        size={13}
        className="shrink-0 text-primary-bright"
      />
      <span className="shrink-0 text-primary-bright">{tool.name}</span>
      <span className="truncate text-fg-faint">{tool.input}</span>
      <span className="ml-auto flex shrink-0 items-center gap-2 text-fg-faint">
        <span className={st.tone}>{st.char}</span>
        <span>{size}</span>
        {onOpen && (
          <Icon name="chevron-right" size={13} className="text-ink-600" />
        )}
      </span>
    </>
  );
  if (!onOpen) return <div className={base}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View ${tool.name} output`}
      className={cx(
        base,
        "w-full text-left transition-colors hover:border-ink-700",
      )}
    >
      {body}
    </button>
  );
}

/** A one-line edit turn: a pencil glyph, the tool name, the file, then the +added / −removed counts.
 *  When `onOpen` is given the whole row is a button (with a drill chevron) that opens the diff modal;
 *  without it the row is a plain, non-interactive line (the subagent drill view). */
function DiffRow({ diff, onOpen }: { diff: DiffEvent; onOpen?: () => void }) {
  const st = TURN_STATUS[diff.status];
  const base =
    "ml-[34px] max-w-[85%] flex items-center gap-2 rounded-lg border border-ink-800 bg-well px-3 py-1.5 font-mono text-meta";
  const body = (
    <>
      <Icon
        name={toolIcon(diff.tool)}
        size={13}
        className="shrink-0 text-primary-bright"
      />
      <span className="shrink-0 text-primary-bright">{diff.tool}</span>
      <span className="truncate text-fg-faint">{diff.file}</span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        <span className={st.tone}>{st.char}</span>
        <span className="text-ok">+{diff.hunk.added.length}</span>
        <span className="text-danger">−{diff.hunk.removed.length}</span>
        {onOpen && (
          <Icon name="chevron-right" size={13} className="text-ink-600" />
        )}
      </span>
    </>
  );
  if (!onOpen) return <div className={base}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View ${diff.tool} diff for ${diff.file}`}
      className={cx(
        base,
        "w-full text-left transition-colors hover:border-ink-700",
      )}
    >
      {body}
    </button>
  );
}

function SubagentDispatch({
  agentType,
  description,
  onDrill,
}: {
  agentType: string;
  description: string;
  onDrill?: () => void;
}) {
  const base =
    "ml-[34px] max-w-[85%] flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/[0.06] px-3 py-2 text-meta";
  const body = (
    <>
      <Icon
        name="git-branch"
        size={13}
        className="shrink-0 text-primary-bright"
      />
      <span className="shrink-0 text-primary-bright">Subagent</span>
      <span className="font-mono text-fg">{agentType}</span>
      {description && (
        <span className="truncate text-fg-faint">— {description}</span>
      )}
      {onDrill && (
        <Icon
          name="chevron-right"
          size={13}
          className="ml-auto shrink-0 text-fg-faint"
        />
      )}
    </>
  );
  if (!onDrill) return <div className={base}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onDrill}
      aria-label={`Drill into ${agentType} subagent`}
      className={cx(
        base,
        "w-full text-left transition-colors hover:border-primary/50 hover:bg-primary/[0.10]",
      )}
    >
      {body}
    </button>
  );
}
