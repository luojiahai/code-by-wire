import { useState, type ReactNode } from "react";
import type { OpenDetail } from "./events";
import { ToolResultModal } from "./ToolResultModal";
import { DiffModal } from "./DiffModal";

/** Owns the open-state for a transcript's detail modals and renders the right one, so the Session
 *  transcript and the drilled Subagent transcript behave identically. `agentId` is set in the subagent
 *  view so a tool's full output is fetched from that subagent's own transcript file. Returns the
 *  `onOpen` to hand to the feed and the `modals` node to render alongside it. */
export function useTranscriptModals(
  sessionId: string,
  agentId?: string,
): { onOpen: (detail: OpenDetail) => void; modals: ReactNode } {
  const [open, setOpen] = useState<OpenDetail | null>(null);
  const modals = (
    <>
      {open?.kind === "tool" && (
        <ToolResultModal
          sessionId={sessionId}
          agentId={agentId}
          tool={open.tool}
          onClose={() => setOpen(null)}
        />
      )}
      {open?.kind === "diff" && (
        <DiffModal diff={open.diff} onClose={() => setOpen(null)} />
      )}
    </>
  );
  return { onOpen: setOpen, modals };
}
