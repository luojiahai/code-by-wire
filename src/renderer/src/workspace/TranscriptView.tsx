import { useEffect, useRef, type ReactNode } from "react";
import type { SessionState } from "@shared/types";
import type { TranscriptEvent } from "@shared/transcript";
import type { DocState } from "./use-transcript";
import { EventItem, type OpenDetail } from "./events";
import type { DispatchDrill } from "./drill-index";

/**
 * The shared event feed: a bottom-sticky list of rendered transcript events. Both the Session
 * TranscriptView and the drilled Subagent view render it. The optional `footer` slot carries the
 * Session's Waiting banner (the Subagent view passes none).
 * Sticks to the bottom when new events arrive — a live, read-only feed.
 */
export function TranscriptFeed({
  events,
  footer,
  dispatchDrill,
  onOpen,
}: {
  events: TranscriptEvent[];
  footer?: ReactNode;
  dispatchDrill?: DispatchDrill;
  onOpen?: (detail: OpenDetail) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const countRef = useRef(0);
  useEffect(() => {
    if (events.length > countRef.current)
      bottomRef.current?.scrollIntoView({ block: "end" });
    countRef.current = events.length;
  }, [events.length]);
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-5">
      {events.map((e, i) => (
        <EventItem
          key={i}
          event={e}
          dispatchDrill={dispatchDrill}
          onOpen={onOpen}
        />
      ))}
      {footer}
      <div ref={bottomRef} />
    </div>
  );
}

/**
 * A session's rendered transcript: the shared event feed plus the Session-specific chrome — a
 * prominent Waiting banner. The polling lives in useTranscript (lifted so the context panel and dock
 * share one doc); this is a pure renderer of the doc it's handed. An Observed (read-only) session
 * carries no persistent on-screen marker; `readOnly` only varies the empty-state copy.
 */
export function TranscriptView({
  doc,
  state,
  readOnly,
  dispatchDrill,
  onOpen,
}: {
  doc: DocState;
  state: SessionState;
  readOnly: boolean;
  dispatchDrill?: DispatchDrill;
  onOpen?: (detail: OpenDetail) => void;
}) {
  if (doc === null) {
    return (
      <Center>
        {readOnly
          ? "No transcript on disk for this session yet."
          : "No transcript yet — drive the session in the Terminal tab."}
      </Center>
    );
  }

  return (
    <div>
      <TranscriptFeed
        events={doc?.events ?? []}
        dispatchDrill={dispatchDrill}
        onOpen={onOpen}
        footer={
          state === "waiting" ? (
            <div className="rounded-lg border border-accent/40 bg-accent/[0.08] p-3">
              <div className="text-meta font-semibold uppercase tracking-wider text-accent-bright">
                Waiting for you
              </div>
              <p className="mt-1 whitespace-pre-wrap font-mono text-aux text-accent-bright">
                {doc?.waitingReason ?? "Waiting for your input"}
              </p>
            </div>
          ) : null
        }
      />
    </div>
  );
}

export function Center({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-aux text-fg-faint">
      {children}
    </div>
  );
}
