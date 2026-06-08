// PROTOTYPE — host shell. Real app chrome (header) wrapping the switchable
// Overview variants and the drill-down Workspace. Throwaway: when a layout
// wins, fold it into the real Overview and delete the rest.
import { useState } from 'react'
import { account, sessions, stats } from './mockData'
import { OverviewA_FleetGrid, name as nameA } from './overview/OverviewA_FleetGrid'
import { OverviewB_MissionTable, name as nameB } from './overview/OverviewB_MissionTable'
import { OverviewC_TriageRail, name as nameC } from './overview/OverviewC_TriageRail'
import { Workspace } from './workspace/Workspace'
import { PrototypeSwitcher } from './PrototypeSwitcher'

const VARIANTS = ['A', 'B', 'C']
const LABELS: Record<string, string> = { A: nameA, B: nameB, C: nameC }

function initialVariant(): string {
  const p = new URLSearchParams(location.search).get('variant')?.toUpperCase()
  return p && VARIANTS.includes(p) ? p : 'A'
}

export function PrototypeApp() {
  const [variant, setVariant] = useState(initialVariant)
  const [openId, setOpenIdState] = useState<string | null>(() => new URLSearchParams(location.search).get('open'))

  function changeVariant(v: string) {
    setVariant(v)
    const sp = new URLSearchParams(location.search)
    sp.set('variant', v)
    history.replaceState(null, '', '?' + sp.toString())
  }

  function setOpenId(id: string | null) {
    setOpenIdState(id)
    const sp = new URLSearchParams(location.search)
    if (id) sp.set('open', id)
    else sp.delete('open')
    history.replaceState(null, '', '?' + sp.toString())
  }

  const open = openId ? sessions.find((s) => s.id === openId) ?? null : null

  return (
    <div className="app-bg flex h-screen flex-col text-fg">
      <AppHeader />
      <main className="min-h-0 flex-1 overflow-hidden">
        {open ? (
          <Workspace session={open} account={account} onBack={() => setOpenId(null)} />
        ) : (
          <div className="h-full overflow-y-auto">
            {variant === 'A' && <OverviewA_FleetGrid sessions={sessions} account={account} stats={stats} onOpen={setOpenId} />}
            {variant === 'B' && <OverviewB_MissionTable sessions={sessions} account={account} stats={stats} onOpen={setOpenId} />}
            {variant === 'C' && <OverviewC_TriageRail sessions={sessions} account={account} stats={stats} onOpen={setOpenId} />}
          </div>
        )}
      </main>
      {!open && <PrototypeSwitcher variants={VARIANTS} labels={LABELS} current={variant} onChange={changeVariant} />}
    </div>
  )
}

function AppHeader() {
  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-ink-800 bg-ink-925/80 px-4 backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="grid h-5 w-5 place-items-center rounded bg-primary text-[10px] font-bold text-white">◢</span>
        <span className="text-sm font-semibold tracking-tight text-fg">code<span className="text-fg-faint">-by-</span>wire</span>
        <span className="ml-1 rounded bg-ink-800 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-fg-faint">prototype</span>
      </div>
      <nav className="ml-2 flex items-center gap-1 text-xs">
        <span className="rounded-md bg-ink-800 px-2.5 py-1 text-fg">Overview</span>
      </nav>
      <div className="ml-auto flex items-center gap-3">
        <button className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary-bright transition-colors hover:bg-primary/20">
          ＋ New session
        </button>
        <div className="flex items-center gap-2 rounded-md bg-ink-850 px-2.5 py-1.5">
          <span className="text-[11px] text-fg-muted">{account.plan}</span>
          <span className="h-3 w-px bg-ink-700" />
          <span className="font-mono text-[11px] text-fg">5h {account.fiveHour.usedPct}%</span>
        </div>
      </div>
    </header>
  )
}
