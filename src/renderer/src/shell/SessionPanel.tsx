import type { ReactNode } from "react";
import type { Session } from "@shared/types";
import type { GitInfo, PrInfo } from "@shared/metrics";
import { modelKnown, modelLabel } from "../ui/meta";
import { PanelSection, PanelHeading } from "../workspace/panels/chrome";
import { useI18n } from "../i18n";
import { GitReadout } from "./GitReadout";

/**
 * The cockpit's identity footer (cockpit spec §Session): Model, Effort, Branch (branch name + dirty
 * dot, popover-free), PR (the #number link — the capture's pr wins over the gh-polled one), Clock,
 * and Active (relative last-activity time) — each an always-shown label/value row; `-` fills a row
 * whose data hasn't landed.
 */
export function SessionPanel({
  session: s,
  git,
  pr,
}: {
  session: Session;
  git?: GitInfo | null;
  pr?: PrInfo | null;
}) {
  const { t } = useI18n();
  const model = modelLabel(
    s.model,
    s.modelId ?? s.modelRaw,
    s.modelDisplayName,
    // Not bare `management === "managed"`: a managed codex session has no spawn model to vouch for
    // (no --model flag exists), so its rawless family is only the Opus normalize fallback (#371).
    { known: modelKnown(s.management, s.agent) },
  );
  const clock =
    s.sessionClockMs != null ? t.time.duration(s.sessionClockMs) : null;
  const prView = s.pr ?? pr ?? null;
  const prStatusRaw = (s.pr?.reviewState ?? pr?.reviewDecision) || pr?.state;
  const prStatus = prStatusRaw
    ? t.shell.sessionPanel.prStatus(prStatusRaw)
    : null;
  return (
    <PanelSection>
      <PanelHeading icon="id-card">{t.shell.sessionPanel.heading}</PanelHeading>
      <SessionRow label={t.shell.sessionPanel.model}>
        <span className="min-w-0 wrap-anywhere" title={model}>
          {model}
        </span>
      </SessionRow>
      <SessionRow label={t.shell.sessionPanel.effort}>
        {s.effortLevel ?? "-"}
      </SessionRow>
      <SessionRow label={t.shell.sessionPanel.branch}>
        <GitReadout session={s} git={git} />
      </SessionRow>
      <SessionRow label={t.shell.sessionPanel.pr}>
        {prView ? (
          <>
            <button
              type="button"
              onClick={() => void window.api.openExternal(prView.url)}
              className="cursor-pointer text-fg hover:underline"
              title={pr?.title ?? prView.url}
            >
              #{prView.number}
            </button>
            {prStatus && (
              <span className="text-(--ui-text-quaternary)">{prStatus}</span>
            )}
          </>
        ) : (
          "-"
        )}
      </SessionRow>
      <SessionRow label={t.shell.sessionPanel.clock}>{clock ?? "-"}</SessionRow>
      {(s.compactionCount ?? 0) > 0 && (
        <SessionRow label={t.shell.sessionPanel.compactions}>
          <span
            title={
              s.compactionTokensReclaimed
                ? t.shell.sessionPanel.tokensReclaimed(
                    t.numbers.tokensShort(s.compactionTokensReclaimed),
                  )
                : undefined
            }
          >
            {s.compactionCount}
          </span>
        </SessionRow>
      )}
      <SessionRow label={t.shell.sessionPanel.active}>
        {t.time.ago(s.lastActivityMs, Date.now())}
      </SessionRow>
    </PanelSection>
  );
}

/** One session row: a plain-case label on the left, a mono value cluster on the right.
 *  Plain case — uppercase is reserved for section headers.
 *
 *  Baseline-aligned, not centered: a wrapping value (Model, Branch) would otherwise pull the label
 *  down to the middle of the block. `py-[3px]` stands in for the old `min-h-[1.375rem]` — a
 *  single-line row keeps the same 22px height (16px line + 6px), and a wrapped one holds its first
 *  line at that same offset instead of growing symmetrically around the label. */
function SessionRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px]">
      <span className="shrink-0 text-xs text-(--ui-text-tertiary)">
        {label}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-(--ui-text-secondary)">
        {children}
      </span>
    </div>
  );
}
