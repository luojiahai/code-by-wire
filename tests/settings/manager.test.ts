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

describe('uninstall — restore byte-for-byte (AC #4)', () => {
  it('restores arbitrary original bytes exactly (4-space indent, no trailing newline, existing statusLine)', () => {
    const home = makeHome()
    // Deliberately not our canonical format: byte-for-byte must hold regardless of formatting.
    const original =
      '{\n    "theme": "dark",\n    "statusLine": {"type":"command","command":"my-prompt","padding":2}\n}'
    writeFileSync(settingsPath(home), original)
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    const { backupPath } = mgr.install()
    expect(readRaw(home)).not.toBe(original) // proves install actually changed the file
    mgr.uninstall()

    expect(readRaw(home)).toBe(original) // byte-for-byte
    expect(mgr.isInstalled()).toBe(false)
    expect(existsSync(backupPath!)).toBe(true) // backups are kept as an audit/recovery trail
  })

  it('restores "no settings.json" by deleting the file install created', () => {
    const home = makeHome()
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    mgr.install()
    expect(existsSync(settingsPath(home))).toBe(true)
    mgr.uninstall()

    expect(existsSync(settingsPath(home))).toBe(false)
    expect(mgr.isInstalled()).toBe(false)
  })

  it('throws rather than silently leaving wrapped settings when the backup is gone', () => {
    const home = makeHome()
    writeFileSync(settingsPath(home), JSON.stringify({ statusLine: { type: 'command', command: 'mine' } }, null, 2))
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    const { backupPath } = mgr.install()
    rmSync(backupPath!) // the backup vanishes

    expect(() => mgr.uninstall()).toThrow(/backup missing/)
    expect(mgr.isInstalled()).toBe(true) // still wrapped — we did NOT silently clear it
  })
})

describe('trust-safety', () => {
  it('install is idempotent: a second install neither re-wraps nor writes a second backup', () => {
    const home = makeHome()
    const original = JSON.stringify({ statusLine: { type: 'command', command: 'my-prompt' }, theme: 'dark' }, null, 2) + '\n'
    writeFileSync(settingsPath(home), original)
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    const first = mgr.install()
    const second = mgr.install() // must be a no-op

    expect(readdirSync(home).filter((f) => f.endsWith('.bak'))).toHaveLength(1) // no second backup
    expect(readState(home).wrappedCommand).toBe('my-prompt') // still the user's, not our own command
    expect(second.wrappedExisting).toBe(true)
    expect(second.backupPath).toBe(first.backupPath)

    mgr.uninstall()
    expect(readRaw(home)).toBe(original) // round-trip still pristine
  })

  it('refuses to touch a malformed settings.json (parse before any write)', () => {
    const home = makeHome()
    const malformed = '{ this is not valid json'
    writeFileSync(settingsPath(home), malformed)
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    expect(() => mgr.install()).toThrow()
    expect(readRaw(home)).toBe(malformed) // untouched
    expect(existsSync(join(home, '.code-by-wire', 'state.json'))).toBe(false) // no state written
    expect(readdirSync(home).filter((f) => f.endsWith('.bak'))).toHaveLength(0) // no backup written
  })

  it('uninstall is a no-op when nothing was installed', () => {
    const home = makeHome()
    const original = JSON.stringify({ theme: 'dark' }, null, 2)
    writeFileSync(settingsPath(home), original)
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    expect(() => mgr.uninstall()).not.toThrow()
    expect(readRaw(home)).toBe(original) // untouched
  })

  it('captures a non-string statusLine command as null, but still marks it wrapped', () => {
    const home = makeHome()
    // A hand-edited file could hold a non-string command. StatusLine.command is *typed* string,
    // but the value comes from JSON.parse with no runtime check — guard the trust boundary.
    writeFileSync(settingsPath(home), JSON.stringify({ statusLine: { type: 'command', command: 123 } }, null, 2))
    const mgr = createSettingsManager({ claudeDir: home, now: () => NOW })

    const result = mgr.install()

    expect(result.wrappedExisting).toBe(true) // a statusLine did exist
    expect(readState(home).wrappedCommand).toBeNull() // ...but there was no string command to call through to
  })
})
