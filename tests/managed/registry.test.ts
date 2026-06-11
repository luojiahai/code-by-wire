import { describe, it, expect } from 'vitest'
import { createManagedRegistry } from '../../src/main/managed-registry'

describe('createManagedRegistry', () => {
  it('reports an id Managed only after it is added', () => {
    const reg = createManagedRegistry()
    expect(reg.has('x')).toBe(false)
    reg.add('x', 100)
    expect(reg.has('x')).toBe(true)
  })

  it('treats add as idempotent', () => {
    const reg = createManagedRegistry()
    reg.add('x', 100)
    reg.add('x', 100)
    expect(reg.has('x')).toBe(true)
  })

  it('keeps ids independent', () => {
    const reg = createManagedRegistry()
    reg.add('a', 100)
    expect(reg.has('a')).toBe(true)
    expect(reg.has('b')).toBe(false)
  })

  it('forgets an id after remove — a Managed session lives only as long as its pty', () => {
    const reg = createManagedRegistry()
    reg.add('x', 100)
    reg.remove('x')
    expect(reg.has('x')).toBe(false)
  })

  it('treats remove of an unknown id as a no-op', () => {
    const reg = createManagedRegistry()
    expect(() => reg.remove('ghost')).not.toThrow()
    expect(reg.has('ghost')).toBe(false)
  })

  it('exposes its managed ptys as id↔pid entries, so rotations can be detected by pid', () => {
    const reg = createManagedRegistry()
    reg.add('a', 100)
    reg.add('b', 200)
    expect(reg.entries()).toEqual([
      { id: 'a', pid: 100 },
      { id: 'b', pid: 200 },
    ])
  })

  it('renames a managed id in place, keeping its pid — follows a /clear rotation', () => {
    const reg = createManagedRegistry()
    reg.add('A', 100)
    reg.rename('A', 'B')
    expect(reg.has('A')).toBe(false)
    expect(reg.has('B')).toBe(true)
    expect(reg.entries()).toEqual([{ id: 'B', pid: 100 }])
  })

  it('treats rename of an unknown id as a no-op', () => {
    const reg = createManagedRegistry()
    expect(() => reg.rename('ghost', 'x')).not.toThrow()
    expect(reg.has('x')).toBe(false)
  })

  it('treats rename onto an already-managed id as a no-op, so it never clobbers another pty', () => {
    const reg = createManagedRegistry()
    reg.add('A', 100)
    reg.add('B', 200)
    reg.rename('A', 'B') // B already maps to a different live pty — don't overwrite it
    expect(reg.entries()).toEqual([
      { id: 'A', pid: 100 },
      { id: 'B', pid: 200 },
    ])
  })
})
