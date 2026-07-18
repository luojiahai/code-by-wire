import { Icon, type IconName } from "../ui/icons";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useI18n, type Translations } from "../i18n";
import { resumeActionDisabled, type ResumeAction } from "./resume-action";

export type ResumeKind = "resume" | "fork";

interface KindSpec {
  label: string;
  busyLabel: string;
  icon: IconName;
  /** The "nothing to {verb}" disabled-tooltip text, pre-resolved for this kind. */
  noConversationTitle: string;
  /** Tooltip when the action is shown but not yet `available` (Resume only — see the `available` prop). */
  unavailableTitle?: string;
  confirmTitle: string;
  confirmBody: string;
  confirmLabel: string;
}

/**
 * The per-kind copy, resolved fresh per call (never captured at module scope) so it tracks the active
 * locale. Reuses `t.shell.sessionMenu.*` rather than minting a duplicate set of keys: this button and the
 * session-menu dropdown's Resume/Fork rows are two surfaces for the exact same actions and historically
 * duplicated this copy verbatim (the same drift `settings.cli.unavailableReason`'s single-sourcing fixed
 * for the CLI-unusable sentence).
 */
function kindSpec(kind: ResumeKind, t: Translations): KindSpec {
  const sm = t.shell.sessionMenu;
  if (kind === "resume") {
    return {
      label: sm.resume,
      busyLabel: sm.resuming,
      icon: "git-pull-request-arrow",
      noConversationTitle: sm.resumeTitleNoConversation,
      unavailableTitle: sm.resumeTitlePending,
      confirmTitle: sm.resumeConfirmTitle,
      confirmBody: sm.resumeConfirmBody,
      confirmLabel: sm.resumeConfirmLabel,
    };
  }
  return {
    label: sm.fork,
    busyLabel: sm.forking,
    icon: "git-branch",
    noConversationTitle: sm.forkTitleNoConversation,
    confirmTitle: sm.forkConfirmTitle,
    confirmBody: sm.forkConfirmBody,
    confirmLabel: sm.forkConfirmLabel,
  };
}

/**
 * The shared Resume/Fork action button, used by both the header cluster and the Ended/Observed terminal
 * hero. It owns the one thing the two surfaces must never disagree on: the gate and its tooltip — both
 * actions read the session's transcript, so they're disabled when the CLI is unusable or the session has
 * no saved conversation, plus Resume's `available` gate (shown on every Ended session but disabled until it
 * re-derives Observed), plus the no-model confirm. Folding those here is what keeps a new gate condition
 * from drifting between the call sites (it did before, which is how the header's Resume shipped without the
 * resumable check). Visual size is the caller's via `className`/`iconSize`; only the behavior is shared,
 * and the caller renders `action.error` wherever its own layout wants it.
 */
export function ResumeButton({
  kind,
  action,
  canSpawn,
  resumable,
  available = true,
  className,
  iconSize,
}: {
  kind: ResumeKind;
  action: ResumeAction;
  /** Whether the Claude Code CLI is usable; both actions spawn it. */
  canSpawn: boolean;
  /** Whether the session has a saved conversation to resume; an unsaved one would 400 the CLI. */
  resumable: boolean;
  /** Resume only: whether the session is resumable right now. Resume shows on every Ended session, but a
   *  just-exited Managed one still reads Managed (pre-sync) and isn't resumable yet, so it renders disabled
   *  until the next sync re-derives it Observed. Fork omits this (always available once resumable). */
  available?: boolean;
  className: string;
  iconSize: number;
}) {
  const { t } = useI18n();
  const spec = kindSpec(kind, t);
  const title = !canSpawn
    ? t.settings.cli.unavailableReason
    : !resumable
      ? // Temporally neutral so it reads right on both a live session that hasn't taken a turn yet
        // (Fork shows there too) and an Ended one that never did.
        spec.noConversationTitle
      : !available
        ? spec.unavailableTitle
        : undefined;
  return (
    <>
      <button
        type="button"
        onClick={action.request}
        disabled={
          action.busy ||
          resumeActionDisabled({ canSpawn, resumable, available })
        }
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
