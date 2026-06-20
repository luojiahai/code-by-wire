import type { ReactNode } from "react";
import type { DiffHunk, TranscriptEvent } from "@shared/transcript";
import { cx } from "../ui/atoms";
import { Icon } from "../ui/icons";
import type { DispatchDrill } from "./drill-index";

/** Render one transcript event. The switch is exhaustive over TranscriptEvent's kinds. */
export function EventItem({
  event,
  dispatchDrill,
}: {
  event: TranscriptEvent;
  dispatchDrill?: DispatchDrill;
}) {
  switch (event.kind) {
    case "user":
      return <Bubble role="user">{event.text}</Bubble>;
    case "assistant":
      return <Bubble role="assistant">{event.text}</Bubble>;
    case "thinking":
      return <Thinking text={event.text} />;
    case "tool":
      return <ToolCall name={event.name} input={event.input} />;
    case "diff":
      return <Diff tool={event.tool} file={event.file} hunk={event.hunk} />;
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
        className={cx(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold",
          user
            ? "bg-ink-900 text-fg-muted"
            : "bg-primary/15 text-primary-bright",
        )}
      >
        {user ? "You" : "C"}
      </div>
      <div
        className={cx(
          "max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed",
          user
            ? "bg-ink-900 text-fg"
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
    <details className="ml-8 text-[11px] text-fg-faint">
      <summary className="cursor-pointer select-none">Thinking</summary>
      <p className="mt-1 whitespace-pre-wrap border-l border-ink-700 pl-2 leading-relaxed">
        {text}
      </p>
    </details>
  );
}

function ToolCall({ name, input }: { name: string; input: string }) {
  return (
    <div className="ml-8 flex items-center gap-2 rounded-lg border border-ink-800 bg-well px-3 py-1.5 font-mono text-[11px]">
      <Icon
        name="terminal"
        size={13}
        className="shrink-0 text-primary-bright"
      />
      <span className="shrink-0 text-primary-bright">{name}</span>
      <span className="truncate text-fg-faint">{input}</span>
    </div>
  );
}

function Diff({
  tool,
  file,
  hunk,
}: {
  tool: string;
  file: string;
  hunk: DiffHunk;
}) {
  return (
    <div className="ml-8 overflow-hidden rounded-lg border border-ink-800 bg-well font-mono text-[11px]">
      <div className="border-b border-ink-800 px-3 py-1.5 text-fg-faint">
        ⏵ {tool}
        {file && ` · ${file}`}
      </div>
      <div className="overflow-x-auto px-3 py-1.5">
        {hunk.removed.map((l, i) => (
          <div key={`r${i}`} className="whitespace-pre text-danger">
            - {l}
          </div>
        ))}
        {hunk.added.map((l, i) => (
          <div key={`a${i}`} className="whitespace-pre text-ok">
            + {l}
          </div>
        ))}
      </div>
    </div>
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
    "ml-8 flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/[0.06] px-3 py-2 text-[11px]";
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
