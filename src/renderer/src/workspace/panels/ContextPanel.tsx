import { useMemo } from 'react'
import type { ContextBreakdown } from '@shared/transcript'
import { contextView } from '@shared/context'
import { formatTokens } from '@shared/format'
import { cx, Bar } from '../../ui/atoms'
import { ctxBar, ctxTone } from '../../ui/meta'
import { PanelSection, PanelHeading } from './chrome'

/**
 * The current context window fill, split by cache state. Prefers Claude's own numbers from the statusLine
 * capture (the current_usage split and the used_percentage), so the panel's % matches the Overview's for
 * the same Session; falls back to the transcript-derived split over the window when no capture reported
 * them. null view means no source has any context yet.
 */
export function ContextPanel({
  live,
  context,
  contextPct,
  contextWindow,
}: {
  live: ContextBreakdown | null
  context: ContextBreakdown | null
  contextPct: number
  contextWindow: number
}) {
  // Pass the captured pct only when there's a live split (then contextPct is the overlaid used_percentage);
  // otherwise the fallback path derives % from tokens-over-window. Memoized so a bare `now` re-render
  // doesn't re-walk the split.
  const view = useMemo(
    () => contextView({ live, fallback: context, capturedPct: live ? contextPct : null, window: contextWindow }),
    [live, context, contextPct, contextWindow],
  )

  if (!view) {
    return (
      <PanelSection>
        <PanelHeading>Context</PanelHeading>
        <p className="text-[11px] text-fg-faint">No context sampled yet.</p>
      </PanelSection>
    )
  }
  const { total, pct, segments } = view
  return (
    <PanelSection>
      <div className="flex items-baseline justify-between gap-2">
        <PanelHeading>Context</PanelHeading>
        <span className={cx('font-mono text-[11px] tabular-nums', ctxTone(pct))}>
          {pct}% · {formatTokens(total)} / {formatTokens(contextWindow)}
        </span>
      </div>
      <Bar pct={pct} fill={ctxBar(pct)} className="w-full" />
      <dl className="space-y-1 pt-0.5">
        {segments.map((s) => (
          <div key={s.key} className="flex items-baseline justify-between gap-2">
            <dt className="text-[11px] text-fg-muted">{s.label}</dt>
            <dd className="shrink-0 font-mono text-[11px] tabular-nums text-fg-faint">
              {formatTokens(s.tokens)} · {s.pct}%
            </dd>
          </div>
        ))}
      </dl>
    </PanelSection>
  )
}
