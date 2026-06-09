import { describe, it, expect } from 'vitest'
import { createManagedRegistry } from '../../src/main/managed-registry'

describe('createManagedRegistry', () => {
  it('reports an id Managed only after it is added', () => {
    const reg = createManagedRegistry()
    expect(reg.has('x')).toBe(false)
    reg.add('x')
    expect(reg.has('x')).toBe(true)
  })

  it('treats add as idempotent', () => {
    const reg = createManagedRegistry()
    reg.add('x')
    reg.add('x')
    expect(reg.has('x')).toBe(true)
  })

  it('keeps ids independent', () => {
    const reg = createManagedRegistry()
    reg.add('a')
    expect(reg.has('a')).toBe(true)
    expect(reg.has('b')).toBe(false)
  })
})
