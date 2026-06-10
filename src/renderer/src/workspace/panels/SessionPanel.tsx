import type { Session } from '@shared/types'
import { honestModelLabel, MODEL_LABEL } from '../../ui/meta'
import { PanelSection, PanelHeading } from './chrome'

/**
 * Per-session metadata, above Context and Cost. v1 holds the model label (honest: an unrecognized model
 * shows its real display_name). The home for the timing, config, and PR details in later slices.
 */
export function SessionPanel({ session: s }: { session: Session }) {
  return (
    <PanelSection>
      <div className="flex items-baseline justify-between gap-2">
        <PanelHeading>Session</PanelHeading>
        <span className="font-mono text-[11px] text-fg-muted">
          {honestModelLabel(s.model, s.modelId, s.modelDisplayName, MODEL_LABEL)}
        </span>
      </div>
    </PanelSection>
  )
}
