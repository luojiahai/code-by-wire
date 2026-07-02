import type { ReactNode } from "react";
import type { Session } from "@shared/types";
import type { GitInfo, PrInfo } from "@shared/metrics";
import { formatClock, formatRelativeTime } from "@shared/format";
import { reviewTone, reviewLabel, type ReviewTone } from "@shared/review-state";
import { modelLabel } from "../ui/meta";
import { PanelSection, PanelHeading } from "../workspace/panels/chrome";
import { GitReadout } from "./GitReadout";

/** Review-state diamond colors: amber pending, green approved, red changes requested, gray anything
 *  unrecognized (rendered verbatim, no whitelist). */
const REVIEW_TONE_COLOR: Record<ReviewTone, string> = {
  pending: "var(--color-accent)",
  approved: "var(--ui-green)",
  changes: "var(--ui-red)",
  neutral: "var(--ui-text-tertiary)",
};

/**
 * The cockpit's identity footer (cockpit spec §Session): Model (with effort folded in), Git (branch
 * + dirty dot + sync, popover-free), PR (link + review state — the capture's pr wins over the
 * gh-polled one), Lines (the session's ± footprint from the capture), Clock, and Active (relative
 * last-activity time — the left sidebar's rows no longer carry it) — each an always-shown
 * label/value row; `-` fills a row whose data hasn't landed.
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
  const model = modelLabel(
    s.model,
    s.modelId ?? s.modelRaw,
    s.modelDisplayName,
    { known: s.management === "managed" },
  );
  const modelValue = s.effortLevel ? `${model} · ${s.effortLevel}` : model;
  const clock = s.sessionClockMs != null ? formatClock(s.sessionClockMs) : null;
  const hasLines = s.linesAdded != null || s.linesRemoved != null;
  const prView = s.pr ?? pr ?? null;
  const reviewState = s.pr?.reviewState ?? null;
  return (
    <PanelSection>
      <PanelHeading icon="id-card">Session</PanelHeading>
      <SessionRow label="Model">
        <span className="min-w-0 truncate" title={modelValue}>
          {modelValue}
        </span>
      </SessionRow>
      <SessionRow label="Git">
        <GitReadout session={s} git={git} />
      </SessionRow>
      <SessionRow label="PR">
        {prView ? (
          <>
            <button
              type="button"
              onClick={() => void window.api.openExternal(prView.url)}
              className="cursor-pointer text-fg hover:underline"
            >
              #{prView.number}
            </button>
            {reviewState && (
              <span
                style={{ color: REVIEW_TONE_COLOR[reviewTone(reviewState)] }}
                title={`Review: ${reviewState}`}
              >
                ◆ {reviewLabel(reviewState)}
              </span>
            )}
          </>
        ) : (
          "-"
        )}
      </SessionRow>
      <SessionRow label="Lines">
        {hasLines ? (
          <>
            <span className="text-(--ui-green)">+{s.linesAdded ?? 0}</span>
            <span className="text-(--ui-red)">−{s.linesRemoved ?? 0}</span>
          </>
        ) : (
          "-"
        )}
      </SessionRow>
      <SessionRow label="Clock">{clock ?? "-"}</SessionRow>
      <SessionRow label="Active">
        {formatRelativeTime(s.lastActivityMs, Date.now())}
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
