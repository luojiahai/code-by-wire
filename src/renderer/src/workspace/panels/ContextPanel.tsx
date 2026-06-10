import { useMemo } from 'react'
import type { ContextBreakdown } from '@shared/transcript'
import { contextTotal, contextSegments, tokensUntilAutoCompact } from '@shared/context'
import { formatTokens } from '@shared/format'
import { cx, Bar } from '../../ui/atoms'
import { ctxBar, ctxTone } from '../../ui/meta'
import { PanelSection, PanelHeading } from './chrome'

/**
 * The current context window fill, split by cache state — the stable cached bulk, the part newly cached
 * this turn, and the fresh input — plus tokens of headroom before auto-compact. Every number is the
 * latest assistant turn's usage split from the transcript (`context`); the window is the session's
 * (statusLine-overlaid when live). null context ⇒ no turn has reported usage yet.
 */
export function ContextPanel({ context, contextWindow }: { context: ContextBreakdown | null; contextWindow: number }) {
  // Derive once per (context, window) so a bare `now` re-render doesn't re-walk the split. null context
  // ⇒ null derived ⇒ the empty state.
  const derived = useMemo(() => {
    if (!context) return null
    const total = contextTotal(context)
    const pct = contextWindow > 0 ? Math.min(100, Math.round((total / contextWindow) * 100)) : 0
    return { total, pct, segments: contextSegments(context), untilCompact: tokensUntilAutoCompact(total, contextWindow) }
  }, [context, contextWindow])

  if (!derived) {
    return (
      <PanelSection>
        <PanelHeading>Context</PanelHeading>
        <p className="text-[11px] text-fg-faint">No context sampled yet.</p>
      </PanelSection>
    )
  }
  const { total, pct, segments, untilCompact } = derived
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
      <div className="flex items-baseline justify-between border-t border-ink-800/70 pt-1.5">
        <span className="text-[11px] text-fg-muted">Auto-compact in</span>
        <span className="font-mono text-[11px] tabular-nums text-fg">~{formatTokens(untilCompact)}</span>
      </div>
    </PanelSection>
  )
}
