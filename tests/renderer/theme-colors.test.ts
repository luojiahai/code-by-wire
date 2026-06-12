import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Read the renderer theme as text — no DOM, no xterm import (that file pulls in the DOM-bound lib).
const root = join(__dirname, '..', '..')
const css = readFileSync(join(root, 'src/renderer/src/index.css'), 'utf8')

/** Parse "#rrggbb" -> [r, g, b]. */
function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!m) throw new Error(`not a 6-digit hex: ${hex}`)
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

/** Channel spread (max - min). 0 is a perfectly neutral grey; any temperature pushes it up. */
function spread(hex: string): number {
  const [r, g, b] = rgb(hex)
  return Math.max(r, g, b) - Math.min(r, g, b)
}

/** Read a `--color-<name>: #hex` value out of the @theme block. */
function token(name: string): string {
  const m = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)
  if (!m) throw new Error(`token --color-${name} not found in index.css`)
  return m[1]
}

// The surface/border stack — the "background colors", darkest to lightest. ink-600 is excluded:
// it is the Ended status hue (a deliberately cool slate), not a surface.
const SURFACE_STACK = ['well', 'ink-950', 'ink-925', 'ink-900', 'ink-850', 'ink-800', 'ink-750', 'ink-700'] as const

describe('cockpit theme — graphite surfaces (not warm, not cool)', () => {
  it('every surface/border token is neutral graphite (channel spread <= 1)', () => {
    for (const name of SURFACE_STACK) {
      const hex = token(name)
      expect(spread(hex), `--color-${name} (${hex}) should be neutral graphite`).toBeLessThanOrEqual(1)
    }
  })

  it('surfaces get strictly lighter from well -> ink-700', () => {
    const lum = SURFACE_STACK.map((n) => rgb(token(n))[0]) // near-equal RGB (spread <= 1), so the red channel tracks lightness
    for (let i = 1; i < lum.length; i++) {
      expect(lum[i], `${SURFACE_STACK[i]} should be lighter than ${SURFACE_STACK[i - 1]}`).toBeGreaterThan(lum[i - 1])
    }
  })

  it('scrollbar chrome is graphite too', () => {
    const thumbs = [...css.matchAll(/scrollbar-thumb[^{]*\{[^}]*background:\s*(#[0-9a-fA-F]{6})/g)].map((m) => m[1])
    expect(thumbs.length, 'expected thumb + hover backgrounds').toBeGreaterThanOrEqual(2)
    for (const hex of thumbs) {
      expect(spread(hex), `scrollbar thumb ${hex} should be neutral graphite`).toBeLessThanOrEqual(1)
    }
  })

  it('the wire accent and status hues stay chromatic (the brand was not greyed out)', () => {
    expect(spread(token('primary')), 'wire blue').toBeGreaterThan(20)
    expect(spread(token('working')), 'teal Working').toBeGreaterThan(20)
    expect(spread(token('accent')), 'amber Waiting').toBeGreaterThan(20)
  })
})

describe('terminal well matches the theme', () => {
  it('xterm background is graphite and equals --color-well', () => {
    const xterm = readFileSync(join(root, 'src/renderer/src/terminal/xterm-factory.ts'), 'utf8')
    const m = /background:\s*'(#[0-9a-fA-F]{6})'/.exec(xterm)
    expect(m, 'xterm theme background hex').toBeTruthy()
    expect(spread(m![1])).toBeLessThanOrEqual(1)
    expect(m![1].toLowerCase()).toBe(token('well').toLowerCase())
  })
})

describe('electron window matches the theme', () => {
  it('BrowserWindow backgroundColor is graphite and equals --color-ink-950', () => {
    const main = readFileSync(join(root, 'src/main/index.ts'), 'utf8')
    const m = /backgroundColor:\s*'(#[0-9a-fA-F]{6})'/.exec(main)
    expect(m, 'electron backgroundColor hex').toBeTruthy()
    expect(spread(m![1])).toBeLessThanOrEqual(1)
    expect(m![1].toLowerCase()).toBe(token('ink-950').toLowerCase())
  })
})

describe('packaged build renders sRGB (mascot color matches dev)', () => {
  it('forces the sRGB color profile in the main process', () => {
    const main = readFileSync(join(root, 'src/main/index.ts'), 'utf8')
    // Without this switch the packaged build inherits the display's wide-gamut (P3) profile and
    // oversaturates the sRGB-authored palette; dev already renders sRGB, so this makes them match.
    expect(main).toMatch(/appendSwitch\(\s*['"]force-color-profile['"]\s*,\s*['"]srgb['"]\s*\)/)
  })
})
