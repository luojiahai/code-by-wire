import type { Session } from "@shared/types";
import { Icon } from "../ui/icons";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { OpenInMenu } from "./OpenInMenu";
import {
  useResumeAction,
  canAdoptSession,
  isModelUnknown,
} from "./resume-action";
import { ResumeButton } from "./ResumeButton";
import { useEndAction } from "./end-action";

/** The header's right-side action cluster: Adopt + Fork + End session, then Open in last. Fork shows on
 *  every session; Adopt joins it (and leads) on every Ended session — disabled while a just-exited Managed
 *  one still reads Managed, then enabling once the next sync re-derives it Observed. End session shows only on
 *  a live Managed session (the one whose pty we own); a turn in flight routes its click through a confirm.
 *  Status chips live on the header's second line, not here. */
export function HeaderActions({
  session: s,
  canSpawn,
  onAdopt,
  onFork,
  onEnd,
}: {
  session: Session;
  /** Whether the Claude Code CLI is usable. Adopt and Fork both resume by spawning the CLI, so they're
   *  disabled (like the rail's New-session button) when the CLI is notFound/unknown. */
  canSpawn: boolean;
  onAdopt: (id: string) => Promise<void>;
  onFork: (session: Session) => Promise<void>;
  /** End the running Managed session (kills the pty we own). */
  onEnd: (id: string) => void;
}) {
  const ended = s.state === "ended";
  // End is for the live session we own: Managed and not yet Ended. Adopt takes the slot once it ends; an
  // Observed-alive session (running elsewhere) shows neither — we don't own that pty.
  const live = s.management === "managed" && s.state !== "ended";
  const midTurn = s.state === "working";
  const canAdopt = canAdoptSession(s);
  const modelUnknown = isModelUnknown(s);

  const adopt = useResumeAction({
    run: () => onAdopt(s.id),
    modelUnknown,
    armed: ended, // re-arm cleanup when Adopt unmounts — i.e. when the session leaves Ended (a resume took)
  });
  const fork = useResumeAction({
    run: () => onFork(s),
    modelUnknown,
    armed: true, // Fork shows on every session; Workspace is keyed by id, so a switch remounts and resets
  });
  // Confirm only mid-turn: ending an idle/waiting session is immediate, but a turn in flight gets a confirm
  // since the kill cuts it. The conversation is durable, so it's recoverable via Adopt either way. `armed`
  // (live and still mid-turn) resets a stale open confirm if the row leaves that state under it — a sync
  // ending it, or its turn finishing — so the dialog can't outlive its premise or reappear after a re-adopt.
  const end = useEndAction({
    run: () => onEnd(s.id),
    midTurn,
    armed: live && midTurn,
  });

  // The gate + tooltip + no-model confirm live in ResumeButton, single-sourced so the two surfaces can't
  // disagree. This row owns only layout: each action's inline error sits before its button (the cluster
  // reads left-to-right), and the chip styling differs from the hero's.
  return (
    <div className="flex shrink-0 items-center gap-2">
      {ended && (
        <>
          {adopt.error && (
            <span className="text-meta text-danger">{adopt.error}</span>
          )}
          <ResumeButton
            kind="adopt"
            action={adopt}
            canSpawn={canSpawn}
            resumable={s.resumable}
            available={canAdopt}
            iconSize={13}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-aux font-medium text-ink-950 ring-1 ring-primary/40 transition-colors enabled:hover:bg-primary-bright disabled:opacity-40"
          />
        </>
      )}

      {fork.error && (
        <span className="text-meta text-danger">{fork.error}</span>
      )}
      <ResumeButton
        kind="fork"
        action={fork}
        canSpawn={canSpawn}
        resumable={s.resumable}
        iconSize={13}
        className="inline-flex items-center gap-1.5 rounded-md border border-ink-800 bg-ink-900 px-2.5 py-1 text-aux text-fg-muted transition-colors enabled:hover:border-ink-700 enabled:hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 disabled:opacity-40"
      />

      {live && (
        <>
          <button
            type="button"
            onClick={end.request}
            title="End this session"
            className="inline-flex items-center gap-1.5 rounded-md border border-danger/30 bg-danger/5 px-2.5 py-1 text-aux text-danger transition-colors hover:border-danger/50 hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-danger/40"
          >
            <Icon name="square" size={13} />
            End session
          </button>
          {end.confirmOpen && (
            <ConfirmDialog
              title="End this session?"
              body="A turn is in progress and will be interrupted. The conversation is saved and can be resumed later with Adopt."
              confirmLabel="End session"
              tone="danger"
              onConfirm={end.confirmYes}
              onCancel={end.confirmNo}
            />
          )}
        </>
      )}

      <Divider />

      <OpenInMenu sessionId={s.id} />
    </div>
  );
}

/** A thin vertical rule between action groups. */
function Divider() {
  return <span className="h-4 w-px bg-ink-800" />;
}
