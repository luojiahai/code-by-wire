import { describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readTasksForSession } from '../../src/main/provider/claude/tasks'
import { tempHomes } from '../helpers/temp-home'

const makeHome = tempHomes('cbw-tasks-')

function writeTask(home: string, sessionId: string, file: string, body: unknown): void {
  const dir = join(home, 'tasks', sessionId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, file), typeof body === 'string' ? body : JSON.stringify(body))
}

describe('readTasksForSession', () => {
  it('maps store files to Task[] in numeric id order, ignoring .lock/.highwatermark', () => {
    const home = makeHome()
    const id = 'sess'
    writeTask(home, id, '2.json', { id: '2', subject: 'Second', status: 'in_progress', blocks: [], blockedBy: [] })
    writeTask(home, id, '10.json', { id: '10', subject: 'Tenth', status: 'pending', blocks: [], blockedBy: [] })
    writeTask(home, id, '1.json', { id: '1', subject: 'First', status: 'completed', blocks: [], blockedBy: [] })
    writeTask(home, id, '.lock', 'x')
    writeTask(home, id, '.highwatermark', '5')

    expect(readTasksForSession(home, id)).toEqual([
      { id: '1', subject: 'First', status: 'completed' },
      { id: '2', subject: 'Second', status: 'in_progress' },
      { id: '10', subject: 'Tenth', status: 'pending' },
    ])
  })

  it('derives blocked for a non-completed task with an unsatisfied dependency', () => {
    const home = makeHome()
    const id = 'sess'
    writeTask(home, id, '1.json', { id: '1', subject: 'Dep', status: 'in_progress', blocks: ['2'], blockedBy: [] })
    writeTask(home, id, '2.json', { id: '2', subject: 'Waiter', status: 'pending', blocks: [], blockedBy: ['1'] })

    expect(readTasksForSession(home, id)).toEqual([
      { id: '1', subject: 'Dep', status: 'in_progress' },
      { id: '2', subject: 'Waiter', status: 'blocked', blockedBy: ['1'] },
    ])
  })

  it('keeps a task pending once its dependency is completed', () => {
    const home = makeHome()
    const id = 'sess'
    writeTask(home, id, '1.json', { id: '1', subject: 'Dep', status: 'completed', blocks: ['2'], blockedBy: [] })
    writeTask(home, id, '2.json', { id: '2', subject: 'Ready', status: 'pending', blocks: [], blockedBy: ['1'] })

    expect(readTasksForSession(home, id)).toEqual([
      { id: '1', subject: 'Dep', status: 'completed' },
      { id: '2', subject: 'Ready', status: 'pending', blockedBy: ['1'] },
    ])
  })

  it('does not latch blocked on a dependency that is not in the task set', () => {
    const home = makeHome()
    const id = 'sess'
    // blockedBy points at '9', which was deleted/renumbered and no longer exists — it cannot block.
    writeTask(home, id, '1.json', { id: '1', subject: 'Orphan dep', status: 'pending', blocks: [], blockedBy: ['9'] })

    expect(readTasksForSession(home, id)).toEqual([
      { id: '1', subject: 'Orphan dep', status: 'pending', blockedBy: ['9'] },
    ])
  })

  it('returns [] when the session has no tasks dir', () => {
    expect(readTasksForSession(makeHome(), 'nope')).toEqual([])
  })

  it('skips a malformed task file without failing the rest', () => {
    const home = makeHome()
    const id = 'sess'
    writeTask(home, id, '1.json', { id: '1', subject: 'Good', status: 'pending', blocks: [], blockedBy: [] })
    writeTask(home, id, '2.json', '{ not json')

    expect(readTasksForSession(home, id)).toEqual([{ id: '1', subject: 'Good', status: 'pending' }])
  })
})
