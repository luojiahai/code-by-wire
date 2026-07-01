import type { Session } from "@shared/types";
import {
  useResumeAction,
  canAdoptSession,
  isModelUnknown,
} from "./resume-action";
import { ResumeButton } from "./ResumeButton";

/**
 * The Terminal tab for a session cbw has no live in-app pty for — an Observed session (running in another
 * terminal) or any Ended one (including a just-exited Managed session that re-derives Observed). A dark
 * canvas offering the ways to take it in-app: Fork (branch the conversation into a new id) is always
 * available; Adopt (resume this exact id) shows on every Ended session — matching the header's gate — but
 * renders disabled while a just-exited Managed one still reads Managed, then enabling once the next sync
 * re-derives it Observed. Transcript stays the default tab. Both buttons reuse the header's resume state
 * machine (busy / inline error / no-model confirm).
 */
export function ObservedTerminal({
  session: s,
  canSpawn,
  onAdopt,
  onFork,
}: {
  session: Session;
  canSpawn: boolean;
  onAdopt: (id: string) => Promise<void>;
  onFork: (session: Session) => Promise<void>;
}) {
  const ended = s.state === "ended";
  const canAdopt = canAdoptSession(s);
  const modelUnknown = isModelUnknown(s);
  // `armed` stays true for both: this panel is keyed by session id (Workspace remounts on a session
  // switch), so the hooks' transient state resets on remount and never needs the in-place re-arm cleanup
  // the header relies on (where Adopt can disappear and reappear within one mounted HeaderActions).
  const adopt = useResumeAction({
    run: () => onAdopt(s.id),
    modelUnknown,
    armed: true,
  });
  const fork = useResumeAction({
    run: () => onFork(s),
    modelUnknown,
    armed: true,
  });

  return (
    <div className="relative flex h-full items-center justify-center bg-ink-950">
      <span className="absolute left-4 top-3 inline-flex items-center gap-1.5 text-label uppercase tracking-wider text-fg-faint">
        <span className="h-1.5 w-1.5 rounded-full bg-ink-600" />
        {ended ? "Ended" : "Observed"}
      </span>
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-body text-fg-faint">
          {ended
            ? "This session has ended. Bring it back to life."
            : "This session is running in another terminal — read-only here."}
        </p>
        <div className="flex items-center gap-3">
          {ended && (
            <ResumeButton
              kind="adopt"
              action={adopt}
              canSpawn={canSpawn}
              resumable={s.resumable}
              available={canAdopt}
              iconSize={15}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-body font-medium text-ink-950 ring-1 ring-primary/40 transition-colors enabled:hover:bg-primary-bright disabled:opacity-40"
            />
          )}
          <ResumeButton
            kind="fork"
            action={fork}
            canSpawn={canSpawn}
            resumable={s.resumable}
            iconSize={15}
            className="inline-flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 px-4 py-2 text-body font-medium text-fg-muted transition-colors enabled:hover:border-ink-600 enabled:hover:text-fg disabled:opacity-40"
          />
        </div>
        {/* Each action owns its own error line, so a stale Adopt failure never masks a fresh Fork one
            (and vice versa) when both buttons are present on an Ended session. */}
        {adopt.error && (
          <span className="text-meta text-danger">{adopt.error}</span>
        )}
        {fork.error && (
          <span className="text-meta text-danger">{fork.error}</span>
        )}
        <span className="text-meta text-fg-faint">
          {ended
            ? "Adopt = take the wheel · Fork = explore a new branch"
            : "Fork it to branch off into your own session."}
        </span>
      </div>
    </div>
  );
}
