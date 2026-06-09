import { describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync, utimesSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { indexTranscripts } from '../../src/main/provider/claude/discover'
import { tempHomes } from '../helpers/temp-home'

const makeHome = tempHomes('cbw-')

// Whole-second mtimes dodge filesystem mtime granularity; the helper returns the file path.
function writeTranscript(home: string, proj: string, id: string, mtimeSec: number): string {
  const dir = join(home, 'projects', proj)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${id}.jsonl`)
  writeFileSync(path, '{"type":"user","message":{"role":"user","content":"hi"}}\n')
  utimesSync(path, new Date(mtimeSec * 1000), new Date(mtimeSec * 1000))
  return path
}

describe('indexTranscripts', () => {
  it('maps each session id to its transcript path and mtime in one sweep', () => {
    const home = makeHome()
    writeTranscript(home, '-work-a', 'sess-a', 1_000_000)
    writeTranscript(home, '-work-b', 'sess-b', 2_000_000)
    const idx = indexTranscripts(home)
    expect([...idx.keys()].sort()).toEqual(['sess-a', 'sess-b'])
    expect(idx.get('sess-a')!.mtimeMs).toBe(1_000_000_000)
    expect(idx.get('sess-b')!.path.endsWith(join('-work-b', 'sess-b.jsonl'))).toBe(true)
  })

  it('ignores non-jsonl files', () => {
    const home = makeHome()
    const dir = join(home, 'projects', '-work-a')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'notes.txt'), 'nope')
    expect(indexTranscripts(home).size).toBe(0)
  })

  it('returns an empty map when projects is missing or unreadable', () => {
    const home = makeHome()
    expect(indexTranscripts(home).size).toBe(0)
    writeFileSync(join(home, 'projects'), 'not a dir') // readdir → ENOTDIR
    expect(indexTranscripts(home).size).toBe(0)
  })

  it('propagates a genuine read failure instead of mistaking an unreadable home for an empty one', () => {
    const home = makeHome()
    // A self-referential symlink makes readdirSync throw ELOOP — a real failure, not "nothing here".
    // Swallowing it would let one bad sweep look like an empty home and wipe the index downstream.
    symlinkSync(join(home, 'projects'), join(home, 'projects'))
    expect(() => indexTranscripts(home)).toThrow()
  })

  it('skips a single unreadable project subdir without sinking the rest of the sweep', () => {
    const home = makeHome()
    writeTranscript(home, '-work-good', 'sess-good', 1_000)
    // One bad project dir (ELOOP) must be skipped, not abort the whole sweep — unlike the root.
    symlinkSync(join(home, 'projects', '-work-bad'), join(home, 'projects', '-work-bad'))
    expect([...indexTranscripts(home).keys()]).toEqual(['sess-good'])
  })

  it('keeps the freshest path when an id appears under two project dirs', () => {
    const home = makeHome()
    writeTranscript(home, '-work-old', 'dup', 1_000)
    const fresh = writeTranscript(home, '-work-new', 'dup', 9_000)
    expect(indexTranscripts(home).get('dup')!.path).toBe(fresh)
  })
})
