import { Icon, type IconName } from "../ui/icons";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import type { ResumeAction } from "./resume-action";

export type ResumeKind = "adopt" | "fork";

interface KindSpec {
  label: string;
  busyLabel: string;
  icon: IconName;
  /** Lowercase verb for the disabled tooltip ("Nothing to {verb} …"). */
  verb: string;
  confirmTitle: string;
  confirmBody: string;
  confirmLabel: string;
}

const KIND: Record<ResumeKind, KindSpec> = {
  adopt: {
    label: "Adopt",
    busyLabel: "Adopting…",
    icon: "git-pull-request-arrow",
    verb: "adopt",
    confirmTitle: "Resume a session with no recorded model?",
    confirmBody:
      "This session never recorded a model — it likely errored before its first turn — so resuming it may fail with a model error. Continue anyway?",
    confirmLabel: "Resume anyway",
  },
  fork: {
    label: "Fork",
    busyLabel: "Forking…",
    icon: "git-branch",
    verb: "fork",
    confirmTitle: "Fork a session with no recorded model?",
    confirmBody:
      "This session never recorded a model — it likely errored before its first turn — so forking it may fail with a model error. Continue anyway?",
    confirmLabel: "Fork anyway",
  },
};

/**
 * The shared Adopt/Fork action button, used by both the header cluster and the Ended/Observed terminal
 * hero. It owns the one thing the two surfaces must never disagree on: the gate and its tooltip — both
 * actions read the session's transcript, so they're disabled when the CLI is unusable or the session has
 * no saved conversation — plus the no-model confirm. Folding those here is what keeps a new gate condition
 * from drifting between the call sites (it did before, which is how the header's Adopt shipped without the
 * resumable check). Visual size is the caller's via `className`/`iconSize`; only the behavior is shared,
 * and the caller renders `action.error` wherever its own layout wants it.
 */
export function ResumeButton({
  kind,
  action,
  canSpawn,
  resumable,
  className,
  iconSize,
}: {
  kind: ResumeKind;
  action: ResumeAction;
  /** Whether the Claude Code CLI is usable; both actions spawn it. */
  canSpawn: boolean;
  /** Whether the session has a saved conversation to resume; an unsaved one would 400 the CLI. */
  resumable: boolean;
  className: string;
  iconSize: number;
}) {
  const spec = KIND[kind];
  const title = !canSpawn
    ? "Claude Code CLI isn't usable — see Sys status in the title bar."
    : resumable
      ? undefined
      : // Temporally neutral so it reads right on both a live session that hasn't taken a turn yet
        // (Fork shows there too) and an Ended one that never did.
        `Nothing to ${spec.verb} — this session has no saved conversation.`;
  return (
    <>
      <button
        type="button"
        onClick={action.request}
        disabled={action.busy || !canSpawn || !resumable}
        title={title}
        className={className}
      >
        <Icon name={spec.icon} size={iconSize} />
        {action.busy ? spec.busyLabel : spec.label}
      </button>
      {action.confirmOpen && (
        <ConfirmDialog
          title={spec.confirmTitle}
          body={spec.confirmBody}
          confirmLabel={spec.confirmLabel}
          onCancel={action.confirmNo}
          onConfirm={action.confirmYes}
        />
      )}
    </>
  );
}
