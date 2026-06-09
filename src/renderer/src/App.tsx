import { useEffect, useState } from 'react'
import type { Session, ProviderCapabilities, ModelId } from '@shared/types'
import type { Stats } from '@shared/stats'
import type { OverviewData } from '@shared/ipc'
import { mergeManaged } from '@shared/managed'
import { newSessionId } from '@shared/terminal'
import { Overview } from './Overview'
import { Workspace } from './workspace/Workspace'
import { NewSessionDialog } from './terminal/NewSessionDialog'
import { terminalStore } from './terminal/terminal-store-instance'

/** How often the session list re-syncs in the background, so an open workspace's state (and the
 *  Overview) tracks a session as it moves. Slower than the transcript poll: metadata changes less
 *  often than the conversation, and a sync re-walks ~/.claude. */
const SYNC_MS = 3000

export function App() {
  const [sessions, setSessions] = useState<Session[]>([])
  // Optimistic Managed sessions spawned this run that discovery hasn't indexed yet. Merged into the
  // list so a new session shows + opens immediately; pruned once its real row lands.
  const [drafts, setDrafts] = useState<Session[]>([])
  const [caps, setCaps] = useState<ProviderCapabilities | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Sessions and stats come from one index read (getOverview), so apply them together — a stale or
  // failed half can't leave the list and the stats disagreeing.
  function applyOverview(o: OverviewData): void {
    setSessions(o.sessions)
    setStats(o.stats)
  }

  async function load(): Promise<void> {
    setLoading(true)
    try {
      const [o, c] = await Promise.all([window.api.overview(), window.api.capabilities()])
      applyOverview(o)
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
        const o = await window.api.refresh()
        if (alive) applyOverview(o)
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

  // Drop a draft once discovery has indexed the real row for its id — the merged list then shows the
  // live row. The terminal keeps streaming throughout; it's driven by the pty, not by this row.
  useEffect(() => {
    setDrafts((ds) => ds.filter((d) => !sessions.some((s) => s.id === d.id)))
  }, [sessions])

  // A draft discovery never indexes (the process died before writing a transcript) would otherwise sit
  // at 'working' forever. When its pty exits, flip the draft to 'ended' so the row stops lying. A draft
  // that did get discovered is already gone, so this is a no-op for it.
  useEffect(() => {
    return window.api.terminal.onExit((id) => {
      setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, state: 'ended' } : d)))
    })
  }, [])

  async function refresh(): Promise<void> {
    setLoading(true)
    try {
      applyOverview(await window.api.refresh())
    } finally {
      setLoading(false)
    }
  }

  async function createSession(cwd: string, model: ModelId): Promise<void> {
    // Mint the id here and stand the terminal up BEFORE spawning, so the very first pty bytes land on a
    // live handle. Rows match xterm's pre-fit default (80x24); the view's first fit corrects it.
    const id = newSessionId()
    terminalStore.create(id)
    try {
      const draft = await window.api.terminal.spawn({ id, cwd, model, cols: 80, rows: 24 })
      setDrafts((ds) => [draft, ...ds])
      setCreating(false)
      setSelectedId(id)
    } catch (e) {
      terminalStore.dispose(id) // spawn failed → nothing will ever feed this handle; don't leak it
      throw e // surfaced by the dialog's catch
    }
  }

  const all = mergeManaged(sessions, drafts)
  const selected = selectedId !== null ? (all.find((s) => s.id === selectedId) ?? null) : null

  if (selected) {
    return <Workspace session={selected} onBack={() => setSelectedId(null)} />
  }

  return (
    <>
      <Overview
        sessions={all}
        caps={caps}
        stats={stats}
        loading={loading}
        onRefresh={() => void refresh()}
        onOpen={(s) => setSelectedId(s.id)}
        onNew={() => setCreating(true)}
      />
      {creating && (
        <NewSessionDialog onCreate={createSession} onCancel={() => setCreating(false)} />
      )}
    </>
  )
}
