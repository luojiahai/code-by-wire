import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@shared/types";
import { cx } from "../ui/atoms";
import { Icon, type IconName } from "../ui/icons";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { OpenInMenu } from "./OpenInMenu";

/** The header's right-side action cluster. Adopt (shown only when an observed session has ended) and
 *  Open in are the wired actions; Interrupt and End ship disabled until their plumbing lands. Status chips
 *  live on the header's second line, not here, so this row is purely actions. */
export function HeaderActions({
  session: s,
  canSpawn,
  onAdopt,
}: {
  session: Session;
  /** Whether the Claude Code CLI is usable. Adopt resumes by spawning the CLI, so it's disabled (like the
   *  rail's New-session button) when the CLI is notFound/unknown, rather than failing only on click. */
  canSpawn: boolean;
  onAdopt: (id: string) => Promise<void>;
}) {
  const canAdopt = s.management === "observed" && s.state === "ended";
  const [adoptBusy, setAdoptBusy] = useState(false);
  const [adoptError, setAdoptError] = useState<string | null>(null);
  const [confirmAdopt, setConfirmAdopt] = useState(false);
  // A session that never recorded a real model (only '<synthetic>' turns — usually one that errored at
  // startup) has no valid model to resume, so `claude --resume` will 400. Don't block Adopt: warn first.
  const modelUnknown = s.modelId == null && s.modelRaw == null;

  // Drop the transient adopt state the moment the button goes away. An observed session can resume and
  // then end again, re-arming Adopt; without this, a stale error (or a wedged busy flag) from the prior
  // attempt would flash on the fresh button.
  useEffect(() => {
    if (!canAdopt) {
      setAdoptBusy(false);
      setAdoptError(null);
      setConfirmAdopt(false);
    }
  }, [canAdopt]);

  async function handleAdopt() {
    setAdoptBusy(true);
    setAdoptError(null);
    try {
      await onAdopt(s.id);
    } catch (e) {
      setAdoptError(e instanceof Error ? e.message : "Failed to resume");
    } finally {
      // Clear busy so an in-place failure (still Observed/Ended, button still shown) leaves it usable
      // rather than stuck on "Adopting…". The re-arm case is covered by the canAdopt effect above.
      setAdoptBusy(false);
    }
  }

  // Gate the click: a modelless session gets the warning modal first; everything else adopts straight away.
  function requestAdopt() {
    if (modelUnknown) setConfirmAdopt(true);
    else void handleAdopt();
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      {canAdopt && (
        <>
          {adoptError && (
            <span className="text-[11px] text-danger">{adoptError}</span>
          )}
          <button
            type="button"
            onClick={requestAdopt}
            disabled={adoptBusy || !canSpawn}
            title={
              canSpawn
                ? undefined
                : "Claude Code CLI isn't usable — see Sys status in the title bar."
            }
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[12px] font-semibold text-ink-950 ring-1 ring-primary/40 transition-colors enabled:hover:bg-primary-bright disabled:opacity-40"
          >
            <Icon name="git-pull-request-arrow" size={13} />
            {adoptBusy ? "Adopting…" : "Adopt"}
          </button>
          {confirmAdopt && (
            <ConfirmDialog
              title="Resume a session with no recorded model?"
              body="This session never recorded a model — it likely errored before its first turn — so resuming it may fail with a model error. Continue anyway?"
              confirmLabel="Resume anyway"
              onCancel={() => setConfirmAdopt(false)}
              onConfirm={() => {
                setConfirmAdopt(false);
                void handleAdopt();
              }}
            />
          )}
          <Divider />
        </>
      )}

      <OpenInMenu sessionId={s.id} />

      <Divider />

      <ComingSoonButton icon="pause">Interrupt</ComingSoonButton>
      <ComingSoonButton icon="square" tone="danger">
        End session
      </ComingSoonButton>
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
