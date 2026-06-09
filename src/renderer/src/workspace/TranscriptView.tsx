import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { SessionState } from '@shared/types'
import type { TranscriptDoc } from '@shared/transcript'
import { EventItem } from './events'

/** How often the Observed view re-reads the transcript. A poll, not a watcher: it matches the app's
 *  request/response IPC, and the read's change token makes an unchanged poll a cheap no-op (the main
 *  process skips the read+parse, the renderer skips the re-render). */
const POLL_MS = 1500

// doc state is tri-state: `undefined` = the first read hasn't landed (show the shell), `null` = read
// and there's no transcript (show the empty state), a doc = render it. That collapses the old
// separate `loaded` flag into the value itself.
type DocState = TranscriptDoc | null | undefined

export function TranscriptView({
  sessionId,
  project,
  state,
}: {
  sessionId: string
  project: string
  state: SessionState
}) {
  const [doc, setDoc] = useState<DocState>(undefined)
  const sinceRef = useRef<number | undefined>(undefined) // last seen change token (mtime)
  const inFlightRef = useRef(false)
  const countRef = useRef(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    sinceRef.current = undefined
    inFlightRef.current = false
    countRef.current = 0
    setDoc(undefined)

    async function poll() {
      // Skip while a read is in flight (a slow read on a big transcript must not let polls overlap
      // and apply out of order) or while the window is hidden (nothing to show, no reason to read).
      if (inFlightRef.current || document.hidden) return
      inFlightRef.current = true
      try {
        const r = await window.api.readTranscript(sessionId, sinceRef.current)
        if (!alive) return
        switch (r.status) {
          case 'changed':
            sinceRef.current = r.mtimeMs
            setDoc(r.doc)
            break
          case 'unchanged':
            break // nothing moved — hold the current doc
          case 'absent':
            sinceRef.current = undefined
            setDoc(null)
            break
          case 'error':
            // Transient read failure: keep the last doc and retry next poll, the same way the
            // session list survives a failed sync. Don't fall back to the empty state.
            break
        }
      } catch {
        // IPC itself failed; treat like a transient error and keep the last doc.
      } finally {
        if (alive) inFlightRef.current = false
      }
    }

    void poll()
    const h = setInterval(() => void poll(), POLL_MS)
    // Read immediately when the window comes back to the foreground, rather than waiting a full poll.
    const onVisible = () => {
      if (!document.hidden) void poll()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      clearInterval(h)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [sessionId])

  // Stick to the bottom when new events arrive — this is a live, read-only feed.
  useEffect(() => {
    const n = doc?.events.length ?? 0
    if (n > countRef.current) bottomRef.current?.scrollIntoView({ block: 'end' })
    countRef.current = n
  }, [doc])

  if (doc === null) {
    return <Center>No transcript on disk for this session yet.</Center>
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-5">
      <div className="sticky top-0 z-10 -mx-5 -mt-5 mb-1 border-b border-ink-800 bg-ink-925/90 px-5 py-2 text-center text-[10px] uppercase tracking-wider text-fg-faint backdrop-blur">
        ● Read-only — live transcript from {project}. You can't type into an Observed session.
      </div>

      {doc?.events.map((e, i) => <EventItem key={i} event={e} />)}

      {state === 'waiting' && (
        <div className="rounded-lg border border-accent/50 bg-accent/[0.08] p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-accent-bright">Waiting for you</div>
          <p className="mt-1 whitespace-pre-wrap font-mono text-[12px] text-accent-bright">
            {doc?.waitingReason ?? 'Waiting for your input'}
          </p>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}

function Center({ children }: { children: ReactNode }) {
  return <div className="flex h-full items-center justify-center text-[12px] text-fg-faint">{children}</div>
}
