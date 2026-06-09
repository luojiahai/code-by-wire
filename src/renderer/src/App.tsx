import { useEffect, useState } from 'react'
import type { Session, ProviderCapabilities } from '@shared/types'
import { Overview } from './Overview'
import { Workspace } from './workspace/Workspace'

/** How often the session list re-syncs in the background, so an open workspace's state (and the
 *  Overview) tracks a session as it moves. Slower than the transcript poll: metadata changes less
 *  often than the conversation, and a sync re-walks ~/.claude. */
const SYNC_MS = 3000

export function App() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [caps, setCaps] = useState<ProviderCapabilities | null>(null)
  const [loading, setLoading] = useState(true)
  // The open session is held by id, not as a snapshot: it's looked up from the live `sessions` each
  // render so the workspace header and the Observed waiting banner track the session instead of
  // freezing at click time.
  const [selectedId, setSelectedId] = useState<string | null>(null)

  async function load(): Promise<void> {
    setLoading(true)
    try {
      const [s, c] = await Promise.all([window.api.listSessions(), window.api.capabilities()])
      setSessions(s)
      setCaps(c)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  // Background re-sync so session state stays live. Silent (no loading spinner) and paused while the
  // window is hidden, so it doesn't flicker the Refresh button or burn a sweep nobody's looking at.
  useEffect(() => {
    let alive = true
    async function tick(): Promise<void> {
      if (document.hidden) return
      try {
        const s = await window.api.refresh()
        if (alive) setSessions(s)
      } catch {
        // Keep the last-known list; the next tick retries.
      }
    }
    const h = setInterval(() => void tick(), SYNC_MS)
    return () => {
      alive = false
      clearInterval(h)
    }
  }, [])

  async function refresh(): Promise<void> {
    setLoading(true)
    try {
      setSessions(await window.api.refresh())
    } finally {
      setLoading(false)
    }
  }

  const selected = selectedId !== null ? (sessions.find((s) => s.id === selectedId) ?? null) : null

  if (selected) {
    return <Workspace session={selected} onBack={() => setSelectedId(null)} />
  }

  return (
    <Overview
      sessions={sessions}
      caps={caps}
      loading={loading}
      onRefresh={() => void refresh()}
      onOpen={(s) => setSelectedId(s.id)}
    />
  )
}
