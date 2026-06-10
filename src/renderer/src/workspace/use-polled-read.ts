import { useEffect, useRef, useState } from 'react'

/** How often the Observed view re-reads a session source. A poll, not a watcher: it matches the app's
 *  request/response IPC, and the read's change token makes an unchanged poll a cheap no-op (the main
 *  process skips the read+parse, the renderer skips the re-render). */
export const POLL_MS = 1500

/** A read's outcome, parameterized by its payload: a fresh value with a change token the caller echoes
 *  back as `since`, the source unchanged, no source, or a transient failure. The transcript/tasks reads
 *  adapt their IPC result (`doc` / `tasks`) into the uniform `data` field. */
export type Read<T> =
  | { status: 'changed'; mtimeMs: number; data: T }
  | { status: 'unchanged'; mtimeMs: number }
  | { status: 'absent' }
  | { status: 'error' }

/**
 * Poll one session source on an interval, returning the latest value. Resets cleanly when the id
 * changes. Skips a poll while one is in flight (a slow read must not let polls overlap and apply out of
 * order) or while the window is hidden; reads immediately when the window returns to the foreground. A
 * transient error keeps the last value rather than blanking the view. Tri-state return: `undefined` =
 * the first read hasn't landed, `null` = read and the source is absent, a value once read.
 */
export function usePolledRead<T>(
  sessionId: string,
  read: (id: string, since?: number) => Promise<Read<T>>,
): T | null | undefined {
  const [value, setValue] = useState<T | null | undefined>(undefined)
  const sinceRef = useRef<number | undefined>(undefined) // last seen change token (mtime)
  const inFlightRef = useRef(false)

  useEffect(() => {
    let alive = true
    sinceRef.current = undefined
    inFlightRef.current = false
    setValue(undefined)

    async function poll() {
      if (inFlightRef.current || document.hidden) return
      inFlightRef.current = true
      try {
        const r = await read(sessionId, sinceRef.current)
        if (!alive) return
        switch (r.status) {
          case 'changed':
            sinceRef.current = r.mtimeMs
            setValue(r.data)
            break
          case 'unchanged':
            break // nothing moved — hold the current value
          case 'absent':
            sinceRef.current = undefined
            setValue(null)
            break
          case 'error':
            break // transient — keep the last value, retry next poll
        }
      } catch {
        // IPC itself failed; treat like a transient error and keep the last value.
      } finally {
        if (alive) inFlightRef.current = false
      }
    }

    void poll()
    const h = setInterval(() => void poll(), POLL_MS)
    const onVisible = () => {
      if (!document.hidden) void poll()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      clearInterval(h)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [sessionId, read])

  return value
}
