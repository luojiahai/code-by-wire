import { Wordmark, cx } from './atoms'
import { Icon } from './icons'

/**
 * The frameless app's title bar: a draggable strip carrying the wordmark and the one global action,
 * New session. On macOS it reserves a left inset for the native traffic lights (window.api.platform).
 * Account identity and rate limits now live in the rail, so this bar is just brand + action.
 */
export function GlobalHeader({ onNew }: { onNew: () => void }) {
  const isMac = window.api.platform === 'darwin'
  return (
    <header
      className={cx(
        'drag-region flex h-11 shrink-0 select-none items-center overflow-hidden border-b border-ink-800 bg-ink-925 pr-4',
        isMac ? 'pl-20' : 'pl-4',
      )}
    >
      <Wordmark />
      <span className="flex-1" />
      <button
        type="button"
        onClick={onNew}
        className="no-drag inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[13px] font-semibold text-ink-950 ring-1 ring-primary/40 transition-colors hover:bg-primary-bright"
      >
        <Icon name="plus" size={14} />
        New session
      </button>
    </header>
  )
}
