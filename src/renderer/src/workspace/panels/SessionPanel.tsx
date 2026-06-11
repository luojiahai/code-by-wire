import type { Session } from '@shared/types'
import { formatClock } from '@shared/format'
import { honestModelLabel, MODEL_LABEL } from '../../ui/meta'
import { PanelSection, PanelHeading } from './chrome'
import { MetricRow } from './MetricRow'

/** Session runtime facts, atop the rail: the Model / Effort / Clock that used to crowd the header.
 *  Effort and Clock are lazy — MetricRow renders a muted em-dash until the capture reports them, so
 *  the empty-state rule comes for free. Voice and Remote were dropped in the redesign. */
export function SessionPanel({ session: s }: { session: Session }) {
  const model = honestModelLabel(s.model, s.modelId, s.modelDisplayName, MODEL_LABEL)
  const clock = s.sessionClockMs != null ? formatClock(s.sessionClockMs) : null
  return (
    <PanelSection>
      <PanelHeading>Session</PanelHeading>
      <MetricRow label="Model" value={model} tone="text-primary-bright" />
      <MetricRow label="Effort" value={s.effortLevel} />
      <MetricRow label="Clock" value={clock} />
    </PanelSection>
  )
}
