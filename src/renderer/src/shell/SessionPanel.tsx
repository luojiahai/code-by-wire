import type { ReactNode } from "react";
import type { Session } from "@shared/types";
import type { GitInfo, PrInfo } from "@shared/metrics";
import { modelLabel } from "../ui/meta";
import { PanelSection, PanelHeading } from "../workspace/panels/chrome";
import { useI18n } from "../i18n";
import { GitReadout } from "./GitReadout";

/**
 * The cockpit's identity footer (cockpit spec §Session): Model, Effort, Git (branch + dirty dot,
 * popover-free), PR (the #number link — the capture's pr wins over the gh-polled one), Lines (the
 * session's ± footprint from the capture), Clock, and Active (relative last-activity time) — each an
 * always-shown label/value row; `-` fills a row whose data hasn't landed.
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
    { known: s.management === "managed" },
  );
  const clock =
    s.sessionClockMs != null ? t.time.duration(s.sessionClockMs) : null;
  const hasLines = s.linesAdded != null || s.linesRemoved != null;
  const prView = s.pr ?? pr ?? null;
  const prStatus =
    ((s.pr?.reviewState ?? pr?.reviewDecision) || pr?.state)
      ?.toLowerCase()
      .replace(/_/g, " ") ?? null;
  return (
    <PanelSection>
      <PanelHeading icon="id-card">{t.shell.sessionPanel.heading}</PanelHeading>
      <SessionRow label={t.shell.sessionPanel.model}>
        <span className="min-w-0 truncate" title={model}>
          {model}
        </span>
      </SessionRow>
      <SessionRow label={t.shell.sessionPanel.effort}>
        {s.effortLevel ?? "-"}
      </SessionRow>
      <SessionRow label={t.shell.sessionPanel.git}>
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
      <SessionRow label={t.shell.sessionPanel.lines}>
        {hasLines ? (
          <>
            <span className="text-(--ui-green)">+{s.linesAdded ?? 0}</span>
            <span className="text-(--ui-red)">−{s.linesRemoved ?? 0}</span>
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
 *  Plain case — uppercase is reserved for section headers. */
function SessionRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[1.375rem] items-center justify-between gap-3">
      <span className="shrink-0 text-xs text-(--ui-text-tertiary)">
        {label}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-(--ui-text-secondary)">
        {children}
      </span>
    </div>
  );
}
