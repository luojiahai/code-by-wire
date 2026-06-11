import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@shared/types'
import { cx } from '../ui/atoms'
import { Icon, type IconName } from '../ui/icons'
import { OpenInMenu } from './OpenInMenu'

/** The header's right-side action cluster. Adopt — the one wired action — leads when an observed session
 *  has ended; the rest (Open in, Interrupt, End) ship disabled until their plumbing lands. Status chips
 *  live on the header's second line, not here, so this row is purely actions. */
export function HeaderActions({
  session: s,
  onAdopt,
}: {
  session: Session
  onAdopt: (id: string) => Promise<void>
}) {
  const canAdopt = s.management === 'observed' && s.state === 'ended'
  const [adoptBusy, setAdoptBusy] = useState(false)
  const [adoptError, setAdoptError] = useState<string | null>(null)

  // Drop the transient adopt state the moment the button goes away. An observed session can resume and
  // then end again, re-arming Adopt; without this, a stale error (or a wedged busy flag) from the prior
  // attempt would flash on the fresh button.
  useEffect(() => {
    if (!canAdopt) {
      setAdoptBusy(false)
      setAdoptError(null)
    }
  }, [canAdopt])

  async function handleAdopt() {
    setAdoptBusy(true)
    setAdoptError(null)
    try {
      await onAdopt(s.id)
    } catch (e) {
      setAdoptError(e instanceof Error ? e.message : 'Failed to resume')
    } finally {
      // Clear busy so an in-place failure (still Observed/Ended, button still shown) leaves it usable
      // rather than stuck on "Adopting…". The re-arm case is covered by the canAdopt effect above.
      setAdoptBusy(false)
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      {canAdopt && (
        <>
          {adoptError && <span className="text-[11px] text-danger">{adoptError}</span>}
          <button
            type="button"
            onClick={() => void handleAdopt()}
            disabled={adoptBusy}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[12px] font-semibold text-ink-950 ring-1 ring-primary/40 transition-colors enabled:hover:bg-primary-bright disabled:opacity-40"
          >
            <Icon name="git-pull-request-arrow" size={13} />
            {adoptBusy ? 'Adopting…' : 'Adopt'}
          </button>
          <Divider />
        </>
      )}

      <OpenInMenu />

      <Divider />

      <ComingSoonButton icon="pause">Interrupt</ComingSoonButton>
      <ComingSoonButton icon="square" tone="danger">
        End session
      </ComingSoonButton>
    </div>
  )
}

/** A thin vertical rule between action groups. */
function Divider() {
  return <span className="h-4 w-px bg-ink-800" />
}

const COMING_SOON_TONES = {
  muted: 'border-ink-800 bg-ink-900 text-fg-muted',
  danger: 'border-danger/30 bg-danger/5 text-danger',
} as const

/** A disabled action pill for a control whose plumbing hasn't landed; its tooltip says it's coming. One
 *  component so the placeholders share a shape and the "coming soon" affordance can't drift between them. */
function ComingSoonButton({
  icon,
  tone = 'muted',
  children,
}: {
  icon: IconName
  tone?: keyof typeof COMING_SOON_TONES
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled
      title="Coming soon"
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] opacity-40',
        COMING_SOON_TONES[tone],
      )}
    >
      <Icon name={icon} size={13} />
      {children}
    </button>
  )
}
