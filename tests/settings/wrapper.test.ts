import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { wrapperScript } from '../../src/main/settings/wrapper'
import { createSettingsManager } from '../../src/main/settings/manager'
import { tempHomes } from '../helpers/temp-home'

const NOW = 1_781_000_000_000
const makeHome = tempHomes('cbw-wrapper-')

describe('wrapperScript (pure source)', () => {
  it('captures session_id and calls through to the wrapped command', () => {
    const src = wrapperScript({ wrappedCommand: 'my-prompt --color' })
    expect(src.startsWith('#!/bin/sh')).toBe(true)
    expect(src).toContain('"session_id"') // extracts the id
    expect(src).toContain('${0%/*}/statusline') // self-locates the capture dir (no baked path)
    expect(src).toContain('case "$sid" in */*) sid= ;; esac') // rejects a traversal id
    expect(src).toContain('cat "$src" | my-prompt --color') // byte-faithful call-through (no $(cat) strip)
  })

  it('omits the call-through when there was no original statusLine (renders blank, ADR-0001)', () => {
    const src = wrapperScript({ wrappedCommand: null })
    expect(src).not.toContain('| my-prompt')
    expect(src).not.toContain('cat "$src" |')
    expect(src).toContain('exit 0')
  })
})

describe.skipIf(process.platform === 'win32')('wrapper end-to-end (runs the generated sh)', () => {
  const SAMPLE = '{"session_id":"abc-123","cost":{"total_cost_usd":0.5}}'

  it('writes the capture file AND passes the JSON through to the wrapped command', () => {
    const home = makeHome()
    // Wrap `cat`, so the wrapper's stdout is exactly the JSON it was fed — proof stdin reached it.
    writeFileSync(join(home, 'settings.json'), JSON.stringify({ statusLine: { type: 'command', command: 'cat' } }))
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })
    mgr.install()

    const wrapperPath = join(home, '.code-by-wire', 'statusline-wrapper.sh')
    const stdout = execFileSync('sh', [wrapperPath], { input: SAMPLE, encoding: 'utf8' })

    // (a) the prompt rendered: the wrapped `cat` echoed the JSON back
    expect(stdout).toBe(SAMPLE)
    // (b) the side-channel capture landed, keyed by session_id
    const capture = join(home, '.code-by-wire', 'statusline', 'abc-123.json')
    expect(existsSync(capture)).toBe(true)
    expect(readFileSync(capture, 'utf8')).toBe(SAMPLE)
  })

  it('still captures when there is no wrapped command, emitting an empty prompt', () => {
    const home = makeHome()
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW }) // no settings.json → no original
    mgr.install()

    const wrapperPath = join(home, '.code-by-wire', 'statusline-wrapper.sh')
    const stdout = execFileSync('sh', [wrapperPath], { input: SAMPLE, encoding: 'utf8' })

    expect(stdout).toBe('') // blank prompt, safe
    expect(existsSync(join(home, '.code-by-wire', 'statusline', 'abc-123.json'))).toBe(true)
  })

  it('feeds the wrapped command Claude’s stdin byte-for-byte, trailing newline preserved', () => {
    const home = makeHome()
    writeFileSync(join(home, 'settings.json'), JSON.stringify({ statusLine: { type: 'command', command: 'cat' } }))
    createSettingsManager({ claudeDir: home, now: () => NOW }).install()

    const wrapperPath = join(home, '.code-by-wire', 'statusline-wrapper.sh')
    const withNewline = SAMPLE + '\n'
    const stdout = execFileSync('sh', [wrapperPath], { input: withNewline, encoding: 'utf8' })

    expect(stdout).toBe(withNewline) // the wrapped `cat` saw the trailing newline (no $(cat) strip)
    expect(readFileSync(join(home, '.code-by-wire', 'statusline', 'abc-123.json'), 'utf8')).toBe(withNewline)
  })

  it('rejects a session_id containing a path separator — nothing escapes the capture dir', () => {
    const home = makeHome()
    writeFileSync(join(home, 'settings.json'), JSON.stringify({ statusLine: { type: 'command', command: 'cat' } }))
    createSettingsManager({ claudeDir: home, now: () => NOW }).install()

    const wrapperPath = join(home, '.code-by-wire', 'statusline-wrapper.sh')
    const stdout = execFileSync('sh', [wrapperPath], { input: '{"session_id":"../../escape"}', encoding: 'utf8' })

    expect(stdout).toBe('{"session_id":"../../escape"}') // still rendered through
    expect(existsSync(join(home, 'escape.json'))).toBe(false) // did not write outside statusline/
    expect(existsSync(join(home, '.code-by-wire', 'escape.json'))).toBe(false)
  })
})
