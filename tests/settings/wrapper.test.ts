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
    const src = wrapperScript({ appDir: '/home/.code-by-wire', wrappedCommand: 'my-prompt --color' })
    expect(src.startsWith('#!/bin/sh')).toBe(true)
    expect(src).toContain('"session_id"') // extracts the id
    expect(src).toContain('/home/.code-by-wire/statusline') // writes into our dir
    expect(src).toContain("printf '%s' \"$input\" | my-prompt --color") // call-through
  })

  it('omits the call-through when there was no original statusLine (renders blank, ADR-0001)', () => {
    const src = wrapperScript({ appDir: '/home/.code-by-wire', wrappedCommand: null })
    expect(src).not.toContain('printf \'%s\' "$input" |')
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
})
