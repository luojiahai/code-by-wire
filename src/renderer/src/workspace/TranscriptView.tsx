import { useEffect, useRef, type ReactNode } from "react";
import type { SessionState } from "@shared/types";
import type { TranscriptEvent } from "@shared/transcript";
import type { DocState } from "./use-transcript";
import { EventItem } from "./events";

/**
 * The shared event feed: a bottom-sticky list of rendered transcript events. Both the Session
 * TranscriptView and the drilled Subagent view render it. The optional `footer` slot carries the
 * Session's Waiting banner (the Subagent view passes none — its breadcrumb owns the read-only signal).
 * Sticks to the bottom when new events arrive — a live, read-only feed.
 */
export function TranscriptFeed({
  events,
  footer,
}: {
  events: TranscriptEvent[];
  footer?: ReactNode;
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
        <EventItem key={i} event={e} />
      ))}
      {footer}
      <div ref={bottomRef} />
    </div>
  );
}

/**
 * A session's rendered transcript: the shared event feed plus the Session-specific chrome — a read-only
 * banner for an Observed session and a prominent Waiting banner. The polling lives in useTranscript
 * (lifted so the context panel and dock share one doc); this is a pure renderer of the doc it's handed.
 */
export function TranscriptView({
  doc,
  project,
  state,
  readOnly,
}: {
  doc: DocState;
  project: string;
  state: SessionState;
  readOnly: boolean;
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
      {readOnly && (
        <div className="sticky top-0 z-10 border-b border-ink-800 bg-ink-925/90 px-5 py-2 text-center text-[10px] uppercase tracking-wider text-fg-faint backdrop-blur">
          ● Read-only — live transcript from {project}. You can't type into an
          Observed session.
        </div>
      )}
      <TranscriptFeed
        events={doc?.events ?? []}
        footer={
          state === "waiting" ? (
            <div className="rounded-lg border border-accent/40 bg-accent/[0.08] p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-accent-bright">
                Waiting for you
              </div>
              <p className="mt-1 whitespace-pre-wrap font-mono text-[12px] text-accent-bright">
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
    <div className="flex h-full items-center justify-center text-[12px] text-fg-faint">
      {children}
    </div>
  );
}
