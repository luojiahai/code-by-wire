import { useState, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { ModelId } from '@shared/types'
import { MODEL_IDS } from '@shared/models'
import { MODEL_LABEL } from '../ui/meta'
import { Icon } from '../ui/icons'

/** The create-a-Managed-session form: choose a directory (native picker) and a model, then spawn. */
export function NewSessionDialog({
  onCreate,
  onCancel,
}: {
  onCreate: (cwd: string, model: ModelId) => void | Promise<void>
  onCancel: () => void
}) {
  const [cwd, setCwd] = useState<string | null>(null)
  const [model, setModel] = useState<ModelId>('claude-sonnet-4-6')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  // Move focus into the dialog on open and restore it to whatever had focus when it closes, so keyboard
  // and screen-reader users aren't stranded on the now-obscured app behind the overlay.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => prev?.focus?.()
  }, [])

  // Minimal focus trap: keep Tab cycling within the dialog instead of wandering to the hidden app behind it.
  function trapTab(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return
    const panel = panelRef.current
    if (!panel) return
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => !el.hasAttribute('disabled'))
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  async function pick() {
    const dir = await window.api.terminal.pickDirectory()
    if (dir) setCwd(dir)
  }

  async function create() {
    if (!cwd || busy) return
    setBusy(true)
    setError(null)
    try {
      await onCreate(cwd, model)
    } catch (e) {
      setBusy(false)
      setError(e instanceof Error ? e.message : 'Failed to start the session')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px]"
      onClick={busy ? undefined : onCancel}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-session-title"
        tabIndex={-1}
        className="w-[28rem] rounded-xl border border-ink-700 bg-ink-900 p-5 text-fg shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapTab}
      >
        <div id="new-session-title" className="text-sm font-semibold">
          New Managed session
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-fg-faint">
          Spawns <span className="font-mono">claude</span> in the chosen directory and drives it from a live terminal.
        </p>

        <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Directory</label>
        <div className="mt-1.5 flex items-center gap-2">
          <button
            onClick={() => void pick()}
            className="inline-flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-925 px-2.5 py-1 text-[12px] transition-colors hover:bg-ink-850"
          >
            <Icon name="folder-open" size={13} /> Choose…
          </button>
          <span className="truncate font-mono text-[12px] text-fg-faint">{cwd ?? 'No directory chosen'}</span>
        </div>

        <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Model</label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value as ModelId)}
          className="mt-1.5 w-full rounded-md border border-ink-700 bg-well px-2.5 py-2 text-[13px] text-fg outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
        >
          {MODEL_IDS.map((id) => (
            <option key={id} value={id}>
              {MODEL_LABEL[id]}
            </option>
          ))}
        </select>

        {error && <p className="mt-3 text-[12px] text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-md px-3 py-1.5 text-[13px] text-fg-muted transition-colors hover:text-fg">
            Cancel
          </button>
          <button
            onClick={create}
            disabled={!cwd || busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[13px] font-semibold text-ink-950 ring-1 ring-primary/40 transition-colors enabled:hover:bg-primary-bright disabled:opacity-40"
          >
            <Icon name="plus" size={13} />
            {busy ? 'Starting…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
