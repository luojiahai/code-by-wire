import { describe, it, expect } from 'vitest'
import { honestModelLabel, MODEL_LABEL, MODEL_SHORT } from '../../src/renderer/src/ui/meta'

describe('honestModelLabel', () => {
  it('shows the clean label for a recognized model (the [1m] tag still matches opus)', () => {
    expect(honestModelLabel('claude-opus-4-8', 'claude-opus-4-8[1m]', 'Opus 4.8 (1M context)', MODEL_LABEL)).toBe('Opus 4.8')
  })

  it("shows the capture's display_name for a model absent from the table", () => {
    expect(honestModelLabel('claude-opus-4-8', 'claude-neo-1', 'Claude Neo 1', MODEL_LABEL)).toBe('Claude Neo 1')
  })

  it('shows the raw model id (never the Opus fallback) for an unrecognized model whose capture omitted display_name', () => {
    expect(honestModelLabel('claude-opus-4-8', 'claude-neo-1', undefined, MODEL_LABEL)).toBe('claude-neo-1')
    expect(honestModelLabel('claude-opus-4-8', 'claude-neo-1', '', MODEL_LABEL)).toBe('claude-neo-1')
  })

  it('falls back to the clean label when there is no capture', () => {
    expect(honestModelLabel('claude-sonnet-4-6', undefined, undefined, MODEL_SHORT)).toBe('Sonnet')
  })
})
