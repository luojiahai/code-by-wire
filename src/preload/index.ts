import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type AppApi } from '@shared/ipc'
import { TERMINAL } from '@shared/terminal'

const api: AppApi = {
  overview: () => ipcRenderer.invoke(IPC.overview),
  refresh: () => ipcRenderer.invoke(IPC.refresh),
  capabilities: () => ipcRenderer.invoke(IPC.capabilities),
  readTranscript: (id, sinceMtimeMs) => ipcRenderer.invoke(IPC.readTranscript, id, sinceMtimeMs),
  terminal: {
    spawn: (req) => ipcRenderer.invoke(TERMINAL.spawn, req),
    write: (id, data) => ipcRenderer.send(TERMINAL.write, id, data),
    resize: (id, cols, rows) => ipcRenderer.send(TERMINAL.resize, id, cols, rows),
    ack: (id, charCount) => ipcRenderer.send(TERMINAL.ack, id, charCount),
    kill: (id) => ipcRenderer.send(TERMINAL.kill, id),
    pickDirectory: () => ipcRenderer.invoke(TERMINAL.pickDirectory),
    // The two PUSH channels. Each returns an unsubscribe fn so a React effect can detach its exact
    // handler on cleanup — without it, every remount would stack another listener (a classic leak).
    onData: (cb) => {
      const handler = (_e: IpcRendererEvent, id: string, data: string) => cb(id, data)
      ipcRenderer.on(TERMINAL.data, handler)
      return () => ipcRenderer.removeListener(TERMINAL.data, handler)
    },
    onExit: (cb) => {
      const handler = (_e: IpcRendererEvent, id: string, code: number) => cb(id, code)
      ipcRenderer.on(TERMINAL.exit, handler)
      return () => ipcRenderer.removeListener(TERMINAL.exit, handler)
    },
  },
}

contextBridge.exposeInMainWorld('api', api)
