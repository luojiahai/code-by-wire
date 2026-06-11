import type { Session } from '@shared/types'
import type { MetricsState } from './use-metrics'
import { formatClock } from '@shared/format'
import { honestModelLabel, MODEL_LABEL } from '../ui/meta'

function Stat({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex flex-col justify-center gap-0.5 border-l border-ink-800 px-3.5 first:border-l-0">
      <span className="text-[9px] uppercase tracking-wider text-fg-faint">{k}</span>
      <span className={`font-mono text-[13px] leading-none ${tone ?? 'text-fg'}`}>{v}</span>
    </div>
  )
}

/** The Core readout in the session header: Model · Effort · Clock · Voice · Remote. Voice/Remote render
 *  only when the lazy metrics report a concrete value (empty-state rule). */
export function SessionHeaderStats({ session: s, metrics }: { session: Session; metrics: MetricsState }) {
  const model = honestModelLabel(s.model, s.modelId, s.modelDisplayName, MODEL_LABEL)
  const m = metrics ?? null
  return (
    <div className="flex shrink-0 items-stretch">
      <Stat k="Model" v={model} tone="text-primary-bright" />
      <Stat k="Effort" v={s.effortLevel ?? '—'} />
      <Stat k="Clock" v={s.sessionClockMs != null ? formatClock(s.sessionClockMs) : '—'} />
      {m?.voiceEnabled != null && <Stat k="Voice" v={m.voiceEnabled ? 'on' : 'off'} tone={m.voiceEnabled ? 'text-fg' : 'text-fg-faint'} />}
      {m?.remoteControl != null && <Stat k="Remote" v={m.remoteControl ? 'on' : 'off'} tone={m.remoteControl ? 'text-fg' : 'text-fg-faint'} />}
    </div>
  )
}
