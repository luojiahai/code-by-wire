import { type ReactNode } from "react";
import type { Session } from "@shared/types";
import { cx } from "../ui/atoms";
import { Icon, type IconName } from "../ui/icons";
import { OpenInMenu } from "./OpenInMenu";
import {
  useResumeAction,
  canAdoptSession,
  isModelUnknown,
} from "./resume-action";
import { ResumeButton } from "./ResumeButton";

/** The header's right-side action cluster: Adopt + Fork + End session, then Open in last. Fork shows on
 *  every session; Adopt joins it (and leads) only when an Observed session has ended. End session ships
 *  disabled until its plumbing lands. Status chips live on the header's second line, not here. */
export function HeaderActions({
  session: s,
  canSpawn,
  onAdopt,
  onFork,
}: {
  session: Session;
  /** Whether the Claude Code CLI is usable. Adopt and Fork both resume by spawning the CLI, so they're
   *  disabled (like the rail's New-session button) when the CLI is notFound/unknown. */
  canSpawn: boolean;
  onAdopt: (id: string) => Promise<void>;
  onFork: (session: Session) => Promise<void>;
}) {
  const canAdopt = canAdoptSession(s);
  const modelUnknown = isModelUnknown(s);

  const adopt = useResumeAction({
    run: () => onAdopt(s.id),
    modelUnknown,
    armed: canAdopt, // re-arm cleanup when an Observed session resumes then ends again
  });
  const fork = useResumeAction({
    run: () => onFork(s),
    modelUnknown,
    armed: true, // Fork shows on every session; Workspace is keyed by id, so a switch remounts and resets
  });

  // The gate + tooltip + no-model confirm live in ResumeButton, single-sourced so the two surfaces can't
  // disagree. This row owns only layout: each action's inline error sits before its button (the cluster
  // reads left-to-right), and the chip styling differs from the hero's.
  return (
    <div className="flex shrink-0 items-center gap-2">
      {canAdopt && (
        <>
          {adopt.error && (
            <span className="text-[11px] text-danger">{adopt.error}</span>
          )}
          <ResumeButton
            kind="adopt"
            action={adopt}
            canSpawn={canSpawn}
            resumable={s.resumable}
            iconSize={13}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[12px] font-semibold text-ink-950 ring-1 ring-primary/40 transition-colors enabled:hover:bg-primary-bright disabled:opacity-40"
          />
        </>
      )}

      {fork.error && (
        <span className="text-[11px] text-danger">{fork.error}</span>
      )}
      <ResumeButton
        kind="fork"
        action={fork}
        canSpawn={canSpawn}
        resumable={s.resumable}
        iconSize={13}
        className="inline-flex items-center gap-1.5 rounded-md border border-ink-800 bg-ink-900 px-2.5 py-1 text-[12px] text-fg-muted transition-colors enabled:hover:border-ink-700 enabled:hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 disabled:opacity-40"
      />

      <ComingSoonButton icon="square" tone="danger">
        End session
      </ComingSoonButton>

      <Divider />

      <OpenInMenu sessionId={s.id} />
    </div>
  );
}

/** A thin vertical rule between action groups. */
function Divider() {
  return <span className="h-4 w-px bg-ink-800" />;
}

const COMING_SOON_TONES = {
  muted: "border-ink-800 bg-ink-900 text-fg-muted",
  danger: "border-danger/30 bg-danger/5 text-danger",
} as const;

/** A disabled action pill for a control whose plumbing hasn't landed; its tooltip says it's coming. One
 *  component so the placeholders share a shape and the "coming soon" affordance can't drift between them. */
function ComingSoonButton({
  icon,
  tone = "muted",
  children,
}: {
  icon: IconName;
  tone?: keyof typeof COMING_SOON_TONES;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled
      title="Coming soon"
      className={cx(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] opacity-40",
        COMING_SOON_TONES[tone],
      )}
    >
      <Icon name={icon} size={13} />
      {children}
    </button>
  );
}
