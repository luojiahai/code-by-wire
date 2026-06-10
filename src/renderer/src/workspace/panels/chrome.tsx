import type { ReactNode } from 'react'

// Shared chrome for the workspace rail panels, so a retone lands in one place.

/** A rail panel's shell: vertical rhythm, a bottom hairline, and bottom padding. */
export function PanelSection({ children }: { children: ReactNode }) {
  return <section className="space-y-2 border-b border-ink-800 pb-3.5 last:border-0">{children}</section>
}

/** A panel's small uppercase eyebrow heading. */
export function PanelHeading({ children }: { children: ReactNode }) {
  return <h2 className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{children}</h2>
}
