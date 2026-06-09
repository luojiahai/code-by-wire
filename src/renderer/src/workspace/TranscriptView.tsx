import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { SessionState } from '@shared/types'
import type { TranscriptView as Doc } from '@shared/transcript'
import { EventItem } from './events'

/** How often the Observed view re-reads the transcript. A poll, not a watcher: it matches the app's
 *  request/response IPC, and an mtime guard makes an unchanged poll a no-op for React. */
const POLL_MS = 1500

export function TranscriptView({
  sessionId,
  project,
  state,
}: {
  sessionId: string
  project: string
  state: SessionState
}) {
  const [doc, setDoc] = useState<Doc | null>(null)
  const [loaded, setLoaded] = useState(false)
  const mtimeRef = useRef(-1)
  const countRef = useRef(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    mtimeRef.current = -1
    setLoaded(false)
    setDoc(null)

    async function poll() {
      try {
        const v = await window.api.readTranscript(sessionId)
        if (!alive) return
        setLoaded(true)
        if (v && v.mtimeMs === mtimeRef.current) return // unchanged since last poll — skip the re-render
        mtimeRef.current = v?.mtimeMs ?? -1
        setDoc(v)
      } catch {
        // A transient read error (e.g. the file briefly unreadable) must not break the view; keep the
        // last doc and let the next poll retry, the same way the session list survives a failed sync.
        if (alive) setLoaded(true)
      }
    }

    void poll()
    const h = setInterval(() => void poll(), POLL_MS)
    return () => {
      alive = false
      clearInterval(h)
    }
  }, [sessionId])

  // Stick to the bottom when new events arrive — this is a live, read-only feed.
  useEffect(() => {
    const n = doc?.events.length ?? 0
    if (n > countRef.current) bottomRef.current?.scrollIntoView({ block: 'end' })
    countRef.current = n
  }, [doc])

  if (loaded && !doc) {
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
