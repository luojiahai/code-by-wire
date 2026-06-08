// PROTOTYPE — floating variant switcher. Hidden in production builds. Cycles
// the ?variant= search param via clicks or ←/→ keys.
import { useEffect } from 'react'

export function PrototypeSwitcher({
  variants, labels, current, onChange,
}: {
  variants: string[]
  labels: Record<string, string>
  current: string
  onChange: (v: string) => void
}) {
  useEffect(() => {
    function cycle(dir: number) {
      const i = variants.indexOf(current)
      onChange(variants[(i + dir + variants.length) % variants.length])
    }
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); cycle(-1) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); cycle(1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, variants, onChange])

  if (import.meta.env.PROD) return null

  const i = variants.indexOf(current)
  return (
    <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-ink-700 bg-ink-850/95 p-1 shadow-[0_8px_30px_-6px_rgba(0,0,0,0.7)] backdrop-blur">
      <button
        onClick={() => onChange(variants[(i - 1 + variants.length) % variants.length])}
        className="grid h-8 w-8 place-items-center rounded-full text-fg-muted transition-colors hover:bg-ink-800 hover:text-fg"
        aria-label="Previous variant"
      >←</button>
      <div className="min-w-[150px] px-2 text-center">
        <span className="font-mono text-xs font-semibold text-primary-bright">{current}</span>
        <span className="ml-2 text-xs text-fg-muted">{labels[current]}</span>
      </div>
      <button
        onClick={() => onChange(variants[(i + 1) % variants.length])}
        className="grid h-8 w-8 place-items-center rounded-full text-fg-muted transition-colors hover:bg-ink-800 hover:text-fg"
        aria-label="Next variant"
      >→</button>
    </div>
  )
}
