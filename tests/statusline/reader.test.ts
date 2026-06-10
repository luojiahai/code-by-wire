import { describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync, utimesSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createStatusLineReader } from '../../src/main/statusline/reader'
import { tempHomes } from '../helpers/temp-home'

const makeHome = tempHomes('cbw-statusline-')

// A fixed clock just after the default capture mtime, so default captures read as fresh (not pruned).
const NOW_MS = 1_781_000_000 + 1000
const open = (home: string) => createStatusLineReader({ claudeDir: home, now: () => NOW_MS })

/** Write a capture file into <home>/.code-by-wire/statusline/<sid>.json and stamp its mtime. */
function writeCapture(home: string, sid: string, json: unknown, mtimeSec = 1_781_000): void {
  const dir = join(home, '.code-by-wire', 'statusline')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${sid}.json`)
  writeFileSync(path, JSON.stringify(json))
  utimesSync(path, mtimeSec, mtimeSec)
}

describe('createStatusLineReader', () => {
  it('returns an empty list when nothing has been captured yet (absent dir)', () => {
    const home = makeHome()
    expect(open(home).read()).toEqual([])
  })

  it('normalizes a subscription capture, converting resets_at seconds to ms', () => {
    const home = makeHome()
    writeCapture(home, 'sess-a', {
      session_id: 'sess-a',
      cost: { total_cost_usd: 0.42, total_lines_added: 156, total_lines_removed: 23 },
      context_window: { used_percentage: 63.7, context_window_size: 200_000 },
      rate_limits: {
        five_hour: { used_percentage: 23.5, resets_at: 1_738_425_600 },
        seven_day: { used_percentage: 41.2, resets_at: 1_738_857_600 },
      },
    })

    const [s] = open(home).read()
    expect(s.sessionId).toBe('sess-a')
    expect(s.costUsd).toBe(0.42)
    expect(s.linesAdded).toBe(156)
    expect(s.linesRemoved).toBe(23)
    expect(s.contextPct).toBe(64) // rounded
    expect(s.contextWindow).toBe(200_000)
    expect(s.rateLimits).toEqual({
      fiveHour: { usedPct: 23.5, resetsAt: 1_738_425_600_000 }, // seconds → ms
      sevenDay: { usedPct: 41.2, resetsAt: 1_738_857_600_000 },
    })
  })

  it('reads an API capture (no rate_limits) as rateLimits: null but still surfaces cost/context', () => {
    const home = makeHome()
    writeCapture(home, 'sess-b', {
      session_id: 'sess-b',
      cost: { total_cost_usd: 0.01 },
      context_window: { used_percentage: 4, context_window_size: 200_000 },
    })

    const [s] = open(home).read()
    expect(s.rateLimits).toBeNull()
    expect(s.costUsd).toBe(0.01)
    expect(s.contextPct).toBe(4)
  })

  it('degrades missing/mistyped fields to null, never throws', () => {
    const home = makeHome()
    writeCapture(home, 'sess-c', { session_id: 'sess-c', cost: { total_cost_usd: 'oops' } })
    const [s] = open(home).read()
    expect(s.costUsd).toBeNull()
    expect(s.contextPct).toBeNull()
    expect(s.contextWindow).toBeNull()
  })

  it('skips a malformed file and a file with no session id, keeping the good ones', () => {
    const home = makeHome()
    const dir = join(home, '.code-by-wire', 'statusline')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'broken.json'), '{ not json')
    writeFileSync(join(dir, 'no-id.json'), JSON.stringify({ cost: { total_cost_usd: 1 } }))
    writeCapture(home, 'good', { session_id: 'good', cost: { total_cost_usd: 2 } })

    const out = open(home).read()
    expect(out.map((s) => s.sessionId)).toEqual(['good'])
  })

  it('stamps each sample with its file mtime in ms', () => {
    const home = makeHome()
    writeCapture(home, 'sess-d', { session_id: 'sess-d' }, 1_781_000)
    expect(open(home).read()[0].capturedMtimeMs).toBe(1_781_000_000)
  })

  it('skips files whose top-level JSON is not an object (array or primitive)', () => {
    const home = makeHome()
    const dir = join(home, '.code-by-wire', 'statusline')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'arr.json'), JSON.stringify([1, 2, 3]))
    writeFileSync(join(dir, 'num.json'), JSON.stringify(42))
    writeFileSync(join(dir, 'str.json'), JSON.stringify('hello'))
    writeCapture(home, 'good', { session_id: 'good', cost: { total_cost_usd: 1 } })

    expect(open(home).read().map((s) => s.sessionId)).toEqual(['good'])
  })

  it('treats rate_limits with malformed windows as a subscription with no usable windows', () => {
    const home = makeHome()
    writeCapture(home, 'sess-e', {
      session_id: 'sess-e',
      rate_limits: { five_hour: 'bad', seven_day: { used_percentage: 'x' } },
    })
    const [s] = open(home).read()
    expect(s.rateLimits).not.toBeNull() // rate_limits present ⇒ still the subscription path, not API
    expect(s.rateLimits).toEqual({ fiveHour: undefined, sevenDay: undefined })
  })

  it('prunes a capture older than the staleness window and stops returning it', () => {
    const home = makeHome()
    writeCapture(home, 'stale', { session_id: 'stale', cost: { total_cost_usd: 9 } }, 1_000_000) // ~9d before NOW_MS
    writeCapture(home, 'fresh', { session_id: 'fresh', cost: { total_cost_usd: 1 } }) // default mtime, fresh

    const out = open(home).read()

    expect(out.map((s) => s.sessionId)).toEqual(['fresh']) // the dead session's capture is gone
    expect(existsSync(join(home, '.code-by-wire', 'statusline', 'stale.json'))).toBe(false) // deleted on read
    expect(existsSync(join(home, '.code-by-wire', 'statusline', 'fresh.json'))).toBe(true) // live one untouched
  })
})
