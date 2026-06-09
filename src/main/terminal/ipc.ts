import { dialog, ipcMain, type BrowserWindow, type IpcMainEvent } from 'electron'
import { basename } from 'node:path'
import type { Session } from '@shared/types'
import type { ModelId } from '@shared/models'
import { TERMINAL, type SpawnRequest } from '@shared/terminal'
import { hydrate } from '../db/store'
import type { ManagedRegistry } from '../managed-registry'
import { createTerminalManager } from './manager'
import { createPtyProcess } from './pty-process'
import { newSessionId } from './command'

/**
 * Build the optimistic Managed draft the renderer shows the instant a session is spawned, before
 * discovery has indexed the real process. Hydrated from zero usage so the derived display fields
 * (context %, equiv value) are well-formed; the real row supersedes it on the next sync.
 */
function draftSession(id: string, cwd: string, model: ModelId): Session {
  const project = basename(cwd) || 'session'
  return hydrate({
    id,
    title: project,
    project,
    branch: undefined,
    state: 'working',
    management: 'managed',
    model,
    lastActivityMs: Date.now(),
    awaitingUser: false,
    transcriptMtimeMs: 0,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
    contextTokens: 0,
  })
}

/**
 * Register the Managed-terminal IPC against one window. The manager pushes batched output and exit to
 * that window's renderer; the registry learns each spawned id so the provider labels it Managed. Ptys
 * die with the window (Managed sessions don't outlive the app — see the plan's scope boundary).
 */
export function registerTerminalIpc({ window, managed }: { window: BrowserWindow; managed: ManagedRegistry }): {
  disposeAll: () => void
} {
  const manager = createTerminalManager({
    send: (id, data) => {
      if (!window.isDestroyed()) window.webContents.send(TERMINAL.data, id, data)
    },
    notifyExit: (id, code) => {
      if (!window.isDestroyed()) window.webContents.send(TERMINAL.exit, id, code)
    },
    onSpawned: (id) => managed.add(id),
    // The composition root: this is the one place node-pty is injected, so the manager (and its tests)
    // stay free of the native addon.
    createPty: createPtyProcess,
  })

  ipcMain.handle(TERMINAL.spawn, (_e, req: SpawnRequest): Session => {
    const id = newSessionId()
    manager.spawn({ id, cwd: req.cwd, model: req.model, cols: req.cols, rows: req.rows })
    return draftSession(id, req.cwd, req.model)
  })
  const onWrite = (_e: IpcMainEvent, id: string, data: string) => manager.write(id, data)
  const onResize = (_e: IpcMainEvent, id: string, cols: number, rows: number) => manager.resize(id, cols, rows)
  const onAck = (_e: IpcMainEvent, id: string, charCount: number) => manager.ack(id, charCount)
  const onKill = (_e: IpcMainEvent, id: string) => manager.kill(id)
  ipcMain.on(TERMINAL.write, onWrite)
  ipcMain.on(TERMINAL.resize, onResize)
  ipcMain.on(TERMINAL.ack, onAck)
  ipcMain.on(TERMINAL.kill, onKill)
  ipcMain.handle(TERMINAL.pickDirectory, async (): Promise<string | null> => {
    const r = await dialog.showOpenDialog(window, { properties: ['openDirectory', 'createDirectory'] })
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
  })

  window.on('closed', () => {
    manager.disposeAll()
    ipcMain.removeHandler(TERMINAL.spawn)
    ipcMain.removeHandler(TERMINAL.pickDirectory)
    ipcMain.removeListener(TERMINAL.write, onWrite)
    ipcMain.removeListener(TERMINAL.resize, onResize)
    ipcMain.removeListener(TERMINAL.ack, onAck)
    ipcMain.removeListener(TERMINAL.kill, onKill)
  })
  return { disposeAll: () => manager.disposeAll() }
}
