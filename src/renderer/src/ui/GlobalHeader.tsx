import { Wordmark, cx } from './atoms'
import { Icon } from './icons'
import { useZoomFactor } from './use-zoom-factor'
import { HEADER_HEIGHT_PX, MAC_TRAFFIC_LIGHT_INSET_PX } from '@shared/chrome'

/**
 * The frameless app's title bar: a draggable strip carrying the wordmark and the one global action,
 * New session. On macOS it reserves a left inset for the native traffic lights and counter-zooms (the
 * `title-bar` class) so it holds a fixed physical size while the rest of the window zooms — otherwise
 * web zoom shrinks the bar under the OS-drawn traffic lights, which don't zoom, and they hang off it.
 * Off macOS there are no traffic lights to align with, so the bar zooms with everything else. Account
 * identity and rate limits now live in the rail, so this bar is just brand + action.
 */
export function GlobalHeader({ onNew }: { onNew: () => void }) {
  const isMac = window.api.platform === 'darwin'
  useZoomFactor(isMac)
  return (
    <header
      className={cx(
        'drag-region flex shrink-0 select-none items-center overflow-hidden border-b border-ink-800 bg-ink-925 pr-4',
        isMac && 'title-bar',
      )}
      style={{ height: HEADER_HEIGHT_PX, paddingLeft: isMac ? MAC_TRAFFIC_LIGHT_INSET_PX : 16 }}
    >
      {/* Equal-weight spacers flank the wordmark so it centers in the usable bar (between the macOS
          traffic-light inset and the action), with the action pinned right. Everything stays in flow,
          so on a narrow window the wordmark and button can never overlap the way an absolute center would. */}
      <div className="flex-1" />
      <Wordmark />
      <div className="flex flex-1 justify-end">
        <button
          type="button"
          onClick={onNew}
          className="no-drag inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[13px] font-semibold text-ink-950 ring-1 ring-primary/40 transition-colors hover:bg-primary-bright"
        >
          <Icon name="plus" size={14} />
          New session
        </button>
      </div>
    </header>
  )
}
