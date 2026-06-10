import { useEffect, useState } from 'react'
import type { Session, ModelId, Account } from '@shared/types'
import type { OverviewData } from '@shared/ipc'
import { mergeManaged, applyAdopting } from '@shared/managed'
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
  // Ids adopted this run that discovery has not yet relabeled Managed. Overlaid by applyAdopting so the
  // adopted row reads Managed/Working immediately, until the next sync confirms it (or its pty exits).
  const [adopting, setAdopting] = useState<Set<string>>(new Set())
  const [account, setAccount] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Sessions and account come from one overview read, so apply them together — a stale or failed
  // half can't leave the list and the account disagreeing.
  function applyOverview(o: OverviewData): void {
    setSessions(o.sessions)
    setAccount(o.account)
  }

  async function load(): Promise<void> {
    setLoading(true)
    try {
      applyOverview(await window.api.overview())
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

  // Drop an adopting override once discovery has relabeled its id Managed — the real row now carries the
  // live state, so the optimistic overlay is done.
  useEffect(() => {
    setAdopting((prev) => {
      if (prev.size === 0) return prev
      const next = new Set(prev)
      for (const session of sessions) if (session.management === 'managed') next.delete(session.id)
      return next.size === prev.size ? prev : next
    })
  }, [sessions])

  // A draft discovery never indexes (the process died before writing a transcript) would otherwise sit at
  // 'working' forever; flip it to 'ended' on pty exit. Also drop any adopting override for that id, so a
  // resume that died reverts to the real (Ended/Observed) row instead of lying Managed.
  useEffect(() => {
    return window.api.terminal.onExit((id) => {
      setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, state: 'ended' } : d)))
      setAdopting((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
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

  // Adopt an Ended session: resume it in-app under its own id. Stand the terminal up first (so the first
  // resume bytes land on a live handle), then optimistically mark it adopting — management flips to
  // Managed and the workspace swaps to the live terminal — until the next sync confirms it.
  async function adoptSession(id: string): Promise<void> {
    // Dispose any stale handle from a prior adopt of this id that has since ended (its buffer still holds
    // the old "[process exited]" scrollback), so a re-adopt starts on a fresh terminal.
    terminalStore.dispose(id)
    terminalStore.create(id)
    try {
      const result = await window.api.terminal.adopt({ id, cols: 80, rows: 24 })
      if (!result.ok) {
        throw new Error(result.reason === 'alive' ? 'This session is alive again.' : 'Could not resume this session.')
      }
      setAdopting((prev) => new Set(prev).add(id))
      setSelectedId(id)
    } catch (e) {
      terminalStore.dispose(id) // adopt refused or failed → nothing will feed this handle; don't leak it
      throw e
    }
  }

  const all = applyAdopting(mergeManaged(sessions, drafts), adopting)
  const selected = selectedId !== null ? (all.find((s) => s.id === selectedId) ?? null) : null

  if (selected) {
    return <Workspace session={selected} account={account} onBack={() => setSelectedId(null)} onAdopt={adoptSession} />
  }

  return (
    <>
      <Overview
        sessions={all}
        account={account}
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
