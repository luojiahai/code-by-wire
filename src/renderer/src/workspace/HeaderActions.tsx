import { type ReactNode } from "react";
import type { Session } from "@shared/types";
import { cx } from "../ui/atoms";
import { Icon, type IconName } from "../ui/icons";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { OpenInMenu } from "./OpenInMenu";
import { useResumeAction } from "./resume-action";

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
  const canAdopt = s.management === "observed" && s.state === "ended";
  // A session that never recorded a real model (only '<synthetic>' turns — usually one that errored at
  // startup) has no valid model to resume, so `claude --resume` will 400. Don't block: warn first.
  const modelUnknown = s.modelId == null && s.modelRaw == null;

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

  const cliTitle = canSpawn
    ? undefined
    : "Claude Code CLI isn't usable — see Sys status in the title bar.";

  return (
    <div className="flex shrink-0 items-center gap-2">
      {canAdopt && (
        <>
          {adopt.error && (
            <span className="text-[11px] text-danger">{adopt.error}</span>
          )}
          <button
            type="button"
            onClick={adopt.request}
            disabled={adopt.busy || !canSpawn}
            title={cliTitle}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[12px] font-semibold text-ink-950 ring-1 ring-primary/40 transition-colors enabled:hover:bg-primary-bright disabled:opacity-40"
          >
            <Icon name="git-pull-request-arrow" size={13} />
            {adopt.busy ? "Adopting…" : "Adopt"}
          </button>
          {adopt.confirmOpen && (
            <ConfirmDialog
              title="Resume a session with no recorded model?"
              body="This session never recorded a model — it likely errored before its first turn — so resuming it may fail with a model error. Continue anyway?"
              confirmLabel="Resume anyway"
              onCancel={adopt.confirmNo}
              onConfirm={adopt.confirmYes}
            />
          )}
        </>
      )}

      {fork.error && (
        <span className="text-[11px] text-danger">{fork.error}</span>
      )}
      <button
        type="button"
        onClick={fork.request}
        disabled={fork.busy || !canSpawn}
        title={cliTitle}
        className="inline-flex items-center gap-1.5 rounded-md border border-ink-800 bg-ink-900 px-2.5 py-1 text-[12px] text-fg-muted transition-colors enabled:hover:border-ink-700 enabled:hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 disabled:opacity-40"
      >
        <Icon name="git-branch" size={13} />
        {fork.busy ? "Forking…" : "Fork"}
      </button>
      {fork.confirmOpen && (
        <ConfirmDialog
          title="Fork a session with no recorded model?"
          body="This session never recorded a model — it likely errored before its first turn — so forking it may fail with a model error. Continue anyway?"
          confirmLabel="Fork anyway"
          onCancel={fork.confirmNo}
          onConfirm={fork.confirmYes}
        />
      )}

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
