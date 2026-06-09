import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSettingsManager } from '../../src/main/settings/manager'

const NOW = 1781000000000 // fixed clock (ms) for deterministic backup timestamps

const tmpHomes: string[] = []
function makeHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'cbw-settings-'))
  tmpHomes.push(home)
  return home
}
afterEach(() => {
  for (const home of tmpHomes.splice(0)) rmSync(home, { recursive: true, force: true })
})

const settingsPath = (home: string) => join(home, 'settings.json')
const readRaw = (home: string) => readFileSync(settingsPath(home), 'utf8')
const readJson = (home: string) => JSON.parse(readRaw(home))
const readState = (home: string) => JSON.parse(readFileSync(join(home, '.code-by-wire', 'state.json'), 'utf8'))

// The exact command install writes — the contract the wrapper script (issue #11) will live behind.
const appCommandFor = (home: string) => `"${join(home, '.code-by-wire', 'statusline-wrapper.sh')}"`

describe('install — clean (AC #2)', () => {
  it('adds the app statusLine and preserves every other key when none exists', () => {
    const home = makeHome()
    writeFileSync(settingsPath(home), JSON.stringify({ theme: 'dark', permissions: { allow: ['Bash'] } }, null, 2))
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    expect(mgr.isInstalled()).toBe(false)
    const result = mgr.install()

    const after = readJson(home)
    expect(after.statusLine).toEqual({ type: 'command', command: appCommandFor(home) })
    expect(after.theme).toBe('dark') // untouched
    expect(after.permissions).toEqual({ allow: ['Bash'] }) // untouched
    expect(result.wrappedExisting).toBe(false)
    expect(mgr.isInstalled()).toBe(true)
  })

  it('creates settings.json from scratch when the file is absent', () => {
    const home = makeHome()
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    expect(existsSync(settingsPath(home))).toBe(false)
    const result = mgr.install()

    expect(readJson(home).statusLine).toEqual({ type: 'command', command: appCommandFor(home) })
    expect(result.wrappedExisting).toBe(false)
    expect(mgr.isInstalled()).toBe(true)
  })
})

describe('install — backup before modification (AC #3)', () => {
  it('writes a timestamped backup whose bytes equal the original, before modifying', () => {
    const home = makeHome()
    const original = JSON.stringify({ theme: 'dark' }, null, 2) + '\n'
    writeFileSync(settingsPath(home), original)
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    const { backupPath } = mgr.install()

    expect(backupPath).not.toBeNull()
    expect(backupPath!.endsWith('.bak')).toBe(true)
    expect(backupPath!.startsWith(home)).toBe(true) // next to settings.json, easy to find by hand
    expect(readFileSync(backupPath!, 'utf8')).toBe(original) // exact pre-install bytes
  })

  it('writes no backup when there was no settings.json to back up', () => {
    const home = makeHome()
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    const { backupPath } = mgr.install()

    expect(backupPath).toBeNull()
    expect(readdirSync(home).filter((f) => f.endsWith('.bak'))).toHaveLength(0)
  })
})

describe('install — wrap an existing statusLine (AC #1)', () => {
  it('records the original command in state.json and reports it wrapped, not clobbered', () => {
    const home = makeHome()
    writeFileSync(
      settingsPath(home),
      JSON.stringify({ statusLine: { type: 'command', command: 'my-prompt --color', padding: 2 } }, null, 2),
    )
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    const result = mgr.install()

    // The app's command is now installed...
    expect(readJson(home).statusLine).toEqual({ type: 'command', command: appCommandFor(home) })
    // ...and the user's original is preserved for the wrapper (issue #11) to call through to.
    const state = readState(home)
    expect(state.wrappedCommand).toBe('my-prompt --color')
    expect(state.originalAbsent).toBe(false)
    expect(state.backupPath).toBe(result.backupPath)
    expect(result.wrappedExisting).toBe(true)
  })

  it('records originalAbsent + null wrappedCommand when settings.json did not exist', () => {
    const home = makeHome()
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    mgr.install()

    const state = readState(home)
    expect(state.originalAbsent).toBe(true)
    expect(state.wrappedCommand).toBeNull()
    expect(state.backupPath).toBeNull()
  })
})
