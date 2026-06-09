import { useEffect, useRef } from 'react'
import { terminalStore } from './terminal-store-instance'

/**
 * Mounts a Managed session's kept-alive terminal into the workspace. The xterm instance lives in the
 * store across tab switches; this component only attaches its persistent wrapper into the container,
 * fits it, and reports the new size to the pty. On unmount it DETACHES the wrapper (never disposes), so
 * returning to the session restores its full scrollback — the whole point of the store.
 */
export function TerminalView({ sessionId }: { sessionId: string }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const handle = terminalStore.create(sessionId) // get-or-create: same instance + scrollback every time

    if (handle.wrapper.parentElement !== container) {
      container.appendChild(handle.wrapper)
    }
    if (!handle.opened) {
      handle.term.open(handle.wrapper) // one-time: build xterm's DOM inside its persistent wrapper
      handle.opened = true
    }

    const sync = () => {
      handle.fit.fit()
      window.api.terminal.resize(sessionId, handle.term.cols, handle.term.rows)
    }
    sync()
    handle.term.focus()

    const ro = new ResizeObserver(sync)
    ro.observe(container)

    return () => {
      ro.disconnect()
      handle.wrapper.remove() // detach, not dispose — the buffer goes back to living off-DOM in the store
    }
  }, [sessionId])

  return <div ref={containerRef} className="h-full w-full" />
}
