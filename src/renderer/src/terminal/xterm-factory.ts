import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { FitLike, XtermLike } from './terminal-store'

/** xterm options tuned for the Claude TUI: generous scrollback, a dark theme matching the app's ink
 *  palette, a monospace stack, and a steady cursor. convertEol stays off — the TUI emits its own. */
const OPTIONS = {
  scrollback: 5000,
  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  fontSize: 12,
  cursorBlink: true,
  theme: { background: '#141413', foreground: '#e6e4dd', cursor: '#e6e4dd' },
} as const

/**
 * Build a real xterm Terminal + FitAddon and a detached wrapper div the terminal lives in. The wrapper
 * is what moves between workspace containers on attach/detach, so the rendered DOM and buffer persist
 * across tab switches. Renderer-only (imports xterm + its CSS); kept out of the store so unit tests
 * never load the DOM-bound library.
 */
export function createXterm(): { term: XtermLike; fit: FitLike; wrapper: HTMLElement } {
  const term = new Terminal(OPTIONS)
  const fit = new FitAddon()
  term.loadAddon(fit)
  const wrapper = document.createElement('div')
  wrapper.style.height = '100%'
  wrapper.style.width = '100%'
  return { term: term as unknown as XtermLike, fit, wrapper }
}
