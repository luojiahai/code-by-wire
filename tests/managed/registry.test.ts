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

  it('forgets an id after remove — a Managed session lives only as long as its pty', () => {
    const reg = createManagedRegistry()
    reg.add('x')
    reg.remove('x')
    expect(reg.has('x')).toBe(false)
  })

  it('treats remove of an unknown id as a no-op', () => {
    const reg = createManagedRegistry()
    expect(() => reg.remove('ghost')).not.toThrow()
    expect(reg.has('ghost')).toBe(false)
  })
})
