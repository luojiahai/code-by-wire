import { describe, it, expect, vi } from 'vitest'
import { FLOW } from '../../src/shared/terminal'
import { createTerminalStore, type XtermLike } from '../../src/renderer/src/terminal/terminal-store'

/** A fake xterm that records writes (with their ack callbacks) and user-input wiring. */
function fakeXterm() {
  const writes: Array<{ data: string; cb?: () => void }> = []
  let inputCb: (d: string) => void = () => {}
  const term: XtermLike = {
    write: (data, cb) => {
      writes.push({ data, cb })
    },
    onData: (cb) => {
      inputCb = cb
      return { dispose: () => {} }
    },
    dispose: vi.fn(),
    open: () => {},
    focus: () => {},
    loadAddon: () => {},
    resize: () => {},
    cols: 80,
    rows: 24,
  }
  return { term, writes, typeInput: (d: string) => inputCb(d) }
}

function harness() {
  let dataRouter: (id: string, d: string) => void = () => {}
  let exitRouter: (id: string, c: number) => void = () => {}
  const api = {
    spawn: vi.fn(),
    adopt: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    ack: vi.fn(),
    kill: vi.fn(),
    pickDirectory: vi.fn(),
    onData: (cb: (id: string, d: string) => void) => {
      dataRouter = cb
      return () => {}
    },
    onExit: (cb: (id: string, c: number) => void) => {
      exitRouter = cb
      return () => {}
    },
    onRename: () => () => {}, // the store exposes rename() directly; App drives it, not this channel
  }
  const made: ReturnType<typeof fakeXterm>[] = []
  const store = createTerminalStore({
    api,
    createTerminal: () => {
      const f = fakeXterm()
      made.push(f)
      return { term: f.term, fit: { fit: () => {}, proposeDimensions: () => undefined }, wrapper: {} as HTMLElement }
    },
  })
  return { store, api, made, route: (id: string, d: string) => dataRouter(id, d), exit: (id: string, c: number) => exitRouter(id, c) }
}

describe('createTerminalStore', () => {
  it('creates one terminal per id and returns the same handle on re-acquire (scrollback keep-alive)', () => {
    const h = harness()
    const a1 = h.store.create('a')
    const a2 = h.store.create('a')
    expect(a1).toBe(a2)
    expect(h.made).toHaveLength(1)
  })

  it('routes pushed output to the matching terminal and ignores unknown ids', () => {
    const h = harness()
    h.store.create('a')
    h.route('a', 'hello')
    expect(h.made[0].writes[0].data).toBe('hello')
    expect(() => h.route('ghost', 'x')).not.toThrow() // no handle → dropped, no throw
  })

  it('acks a chunk it has to drop, so the pty never leaks flow-control credit', () => {
    const h = harness()
    // No handle for 'ghost'. The manager already counted these chars as unacked when it sent them,
    // so the store credits them straight back instead of stranding them and wedging a paused pty.
    h.route('ghost', 'xyz')
    expect(h.api.ack).toHaveBeenCalledWith('ghost', 3)
  })

  it('forwards user keystrokes to the pty for the right id', () => {
    const h = harness()
    h.store.create('a')
    h.made[0].typeInput('ls\r')
    expect(h.api.write).toHaveBeenCalledWith('a', 'ls\r')
  })

  it('acks consumed output in 5k chunks once xterm finishes the write', () => {
    const h = harness()
    h.store.create('a')
    h.route('a', 'x'.repeat(FLOW.ackChars + 10)) // one write of 5010 chars
    expect(h.api.ack).not.toHaveBeenCalled() // nothing acked until xterm signals the write is done
    h.made[0].writes[0].cb!() // xterm write-completion callback fires
    expect(h.api.ack).toHaveBeenCalledTimes(1)
    expect(h.api.ack).toHaveBeenCalledWith('a', FLOW.ackChars) // one full chunk; the 10 remainder waits
  })

  it('writes an exit notice on process exit, keeping the buffer', () => {
    const h = harness()
    h.store.create('a')
    h.exit('a', 0)
    expect(h.store.get('a')).toBeDefined() // handle kept so the scrollback stays readable
    expect(h.made[0].writes.at(-1)?.data).toContain('exited')
  })

  it('rename: migrates a live handle to a new id so output and keystrokes follow, freeing the old id', () => {
    const h = harness()
    h.store.create('a')
    h.store.rename('a', 'b')

    h.route('b', 'after')
    expect(h.made[0].writes.at(-1)?.data).toBe('after') // same xterm receives output under the new id

    h.made[0].typeInput('x')
    expect(h.api.write).toHaveBeenCalledWith('b', 'x') // keystrokes now write under the new id

    expect(h.store.get('a')).toBeUndefined() // old id freed
    expect(h.store.get('b')).toBe(h.store.get('b')) // and the handle lives under the new id
    expect(h.store.get('b')).toBeDefined()
  })

  it('rename: credits in-flight output acked after the rotation instead of leaking the flow-control credit', () => {
    const h = harness()
    h.store.create('a')
    h.route('a', 'x'.repeat(FLOW.ackChars + 10)) // output arrives under the old id; its ack callback is pending
    const inFlightCb = h.made[0].writes[0].cb!
    h.store.rename('a', 'b') // a /clear rotates a->b while that write is still mid-parse
    inFlightCb() // xterm finishes parsing AFTER the rename
    expect(h.api.ack).toHaveBeenCalledWith('b', FLOW.ackChars) // credited under the live id, not dropped
  })

  it('rename: is a no-op for an unknown id', () => {
    const h = harness()
    h.store.create('a')
    expect(() => h.store.rename('ghost', 'b')).not.toThrow()
    expect(h.store.get('a')).toBeDefined()
    expect(h.store.get('b')).toBeUndefined()
  })

  it('dispose() tears down the terminal and forgets the id', () => {
    const h = harness()
    h.store.create('a')
    h.store.dispose('a')
    expect(h.made[0].term.dispose).toHaveBeenCalled()
    expect(h.store.get('a')).toBeUndefined()
  })

  it('drops a late ack callback after the terminal is disposed', () => {
    const h = harness()
    h.store.create('a')
    h.route('a', 'x'.repeat(FLOW.ackChars + 10))
    const lateCb = h.made[0].writes[0].cb!
    h.store.dispose('a')
    lateCb() // xterm write-completion firing after dispose
    expect(h.api.ack).not.toHaveBeenCalled()
    expect(h.store.get('a')).toBeUndefined()
  })

  it('includes a non-zero exit code in the notice', () => {
    const h = harness()
    h.store.create('b')
    h.exit('b', 1)
    expect(h.made[0].writes.at(-1)?.data).toContain('(1)')
  })
})
