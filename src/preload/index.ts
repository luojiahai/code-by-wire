import {
  contextBridge,
  ipcRenderer,
  webFrame,
  type IpcRendererEvent,
} from "electron";
import { IPC, type AppApi } from "@shared/ipc";
import { TERMINAL } from "@shared/terminal";

const api: AppApi = {
  overview: () => ipcRenderer.invoke(IPC.overview),
  refresh: () => ipcRenderer.invoke(IPC.refresh),
  capabilities: () => ipcRenderer.invoke(IPC.capabilities),
  readTranscript: (id, sinceMtimeMs) =>
    ipcRenderer.invoke(IPC.readTranscript, id, sinceMtimeMs),
  readTasks: (id, sinceMtimeMs) =>
    ipcRenderer.invoke(IPC.readTasks, id, sinceMtimeMs),
  readMetrics: (id, sinceMtimeMs) =>
    ipcRenderer.invoke(IPC.readMetrics, id, sinceMtimeMs),
  platform: process.platform,
  getZoomFactor: () => webFrame.getZoomFactor(),
  onFullscreenChange: (cb) => {
    const handler = (_e: IpcRendererEvent, isFullscreen: boolean) =>
      cb(isFullscreen);
    ipcRenderer.on(IPC.fullscreen, handler);
    return () => ipcRenderer.removeListener(IPC.fullscreen, handler);
  },
  terminal: {
    spawn: (req) => ipcRenderer.invoke(TERMINAL.spawn, req),
    adopt: (req) => ipcRenderer.invoke(TERMINAL.adopt, req),
    write: (id, data) => ipcRenderer.send(TERMINAL.write, id, data),
    resize: (id, cols, rows) =>
      ipcRenderer.send(TERMINAL.resize, id, cols, rows),
    ack: (id, charCount) => ipcRenderer.send(TERMINAL.ack, id, charCount),
    kill: (id) => ipcRenderer.send(TERMINAL.kill, id),
    pickDirectory: () => ipcRenderer.invoke(TERMINAL.pickDirectory),
    // The two PUSH channels. Each returns an unsubscribe fn so a React effect can detach its exact
    // handler on cleanup — without it, every remount would stack another listener (a classic leak).
    onData: (cb) => {
      const handler = (_e: IpcRendererEvent, id: string, data: string) =>
        cb(id, data);
      ipcRenderer.on(TERMINAL.data, handler);
      return () => ipcRenderer.removeListener(TERMINAL.data, handler);
    },
    onExit: (cb) => {
      const handler = (_e: IpcRendererEvent, id: string, code: number) =>
        cb(id, code);
      ipcRenderer.on(TERMINAL.exit, handler);
      return () => ipcRenderer.removeListener(TERMINAL.exit, handler);
    },
    onRename: (cb) => {
      const handler = (_e: IpcRendererEvent, from: string, to: string) =>
        cb(from, to);
      ipcRenderer.on(TERMINAL.rename, handler);
      return () => ipcRenderer.removeListener(TERMINAL.rename, handler);
    },
  },
};

contextBridge.exposeInMainWorld("api", api);
