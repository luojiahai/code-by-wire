import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type IpcApi } from '@shared/ipc'

const api: IpcApi = {
  listSessions: () => ipcRenderer.invoke(IPC.listSessions),
  refresh: () => ipcRenderer.invoke(IPC.refresh),
  capabilities: () => ipcRenderer.invoke(IPC.capabilities),
  readTranscript: (id, sinceMtimeMs) => ipcRenderer.invoke(IPC.readTranscript, id, sinceMtimeMs),
}

contextBridge.exposeInMainWorld('api', api)
