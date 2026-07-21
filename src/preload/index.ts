import {
  contextBridge,
  ipcRenderer,
  webFrame,
  webUtils,
  type IpcRendererEvent,
} from "electron";
import { IPC, type AppApi } from "@shared/ipc";
import { TERMINAL } from "@shared/terminal";
import { SHELL_TERMINAL } from "@shared/shell-terminal";

const api: AppApi = {
  overview: () => ipcRenderer.invoke(IPC.overview),
  refresh: () => ipcRenderer.invoke(IPC.refresh),
  modelDefaults: () => ipcRenderer.invoke(IPC.modelDefaults),
  readStats: (agent, range, calendarYear, since) =>
    ipcRenderer.invoke(IPC.readStats, agent, range, calendarYear, since),
  pumpStats: () => ipcRenderer.invoke(IPC.pumpStats),
  dbInfo: () => ipcRenderer.invoke(IPC.dbInfo),
  recheckCli: (agent) => ipcRenderer.invoke(IPC.recheckCli, agent),
  resetAnalytics: () => ipcRenderer.invoke(IPC.resetAnalytics),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  revealPath: (path) => ipcRenderer.invoke(IPC.revealPath, path),
  openIn: (id, target) => ipcRenderer.invoke(IPC.openIn, id, target),
  clipboardWriteText: (text) =>
    ipcRenderer.invoke(IPC.clipboardWriteText, text),
  clipboardReadText: (type) => ipcRenderer.invoke(IPC.clipboardReadText, type),
  renameSession: (id, title) =>
    ipcRenderer.invoke(IPC.renameSession, id, title),
  setSessionPinned: (id, pinned) =>
    ipcRenderer.invoke(IPC.setSessionPinned, id, pinned),
  getLaunchPresets: () => ipcRenderer.invoke(IPC.launchPresetsGet),
  setLaunchPresets: (presets) =>
    ipcRenderer.invoke(IPC.launchPresetsSet, presets),
  setProjectPlacement: (key, placement) =>
    ipcRenderer.invoke(IPC.setProjectPlacement, key, placement),
  readTranscript: (id, sinceMtimeMs) =>
    ipcRenderer.invoke(IPC.readTranscript, id, sinceMtimeMs),
  getToolResult: (id, toolUseId, agentId) =>
    ipcRenderer.invoke(IPC.getToolResult, id, toolUseId, agentId),
  getUpdateState: () => ipcRenderer.invoke(IPC.updateGetState),
  checkForUpdate: () => ipcRenderer.invoke(IPC.updateCheck),
  downloadUpdate: () => ipcRenderer.invoke(IPC.updateDownload),
  installUpdate: () => {
    void ipcRenderer.invoke(IPC.updateInstall);
  },
  getAutoCheckUpdates: () => ipcRenderer.invoke(IPC.updateGetAutoCheck),
  setAutoCheckUpdates: (enabled) =>
    ipcRenderer.invoke(IPC.updateSetAutoCheck, enabled),
  getAppTheme: () => ipcRenderer.invoke(IPC.appearanceGetAppTheme),
  setAppTheme: (theme) => ipcRenderer.invoke(IPC.appearanceSetAppTheme, theme),
  getTerminalTheme: () => ipcRenderer.invoke(IPC.appearanceGetTerminalTheme),
  setTerminalTheme: (theme) =>
    ipcRenderer.invoke(IPC.appearanceSetTerminalTheme, theme),
  getLocale: () => ipcRenderer.invoke(IPC.appearanceGetLocale),
  setLocale: (locale) => ipcRenderer.invoke(IPC.appearanceSetLocale, locale),
  getStatuslineStatus: () => ipcRenderer.invoke(IPC.statuslineGetStatus),
  setStatuslineEnabled: (enabled) =>
    ipcRenderer.invoke(IPC.statuslineSetEnabled, enabled),
  setStatuslineRefreshInterval: (seconds) =>
    ipcRenderer.invoke(IPC.statuslineSetRefreshInterval, seconds),
  repairStatusline: () => ipcRenderer.invoke(IPC.statuslineRepair),
  getCaffeinate: () => ipcRenderer.invoke(IPC.caffeinateGet),
  setCaffeinate: (on) => ipcRenderer.invoke(IPC.caffeinateSet, on),
  readSubagentTranscript: (id, agentId, sinceMtimeMs) =>
    ipcRenderer.invoke(IPC.readSubagentTranscript, id, agentId, sinceMtimeMs),
  readTasks: (id, sinceMtimeMs) =>
    ipcRenderer.invoke(IPC.readTasks, id, sinceMtimeMs),
  readShells: (id, sinceMtimeMs) =>
    ipcRenderer.invoke(IPC.readShells, id, sinceMtimeMs),
  readShellOutput: (id, shellId, sinceMtimeMs) =>
    ipcRenderer.invoke(IPC.readShellOutput, id, shellId, sinceMtimeMs),
  readMonitors: (id, sinceMtimeMs) =>
    ipcRenderer.invoke(IPC.readMonitors, id, sinceMtimeMs),
  readMonitorOutput: (id, monitorId, sinceMtimeMs) =>
    ipcRenderer.invoke(IPC.readMonitorOutput, id, monitorId, sinceMtimeMs),
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
  onUpdateState: (cb) => {
    const handler = (
      _e: IpcRendererEvent,
      state: import("@shared/ipc").UpdateState,
    ) => cb(state);
    ipcRenderer.on(IPC.updateState, handler);
    return () => ipcRenderer.removeListener(IPC.updateState, handler);
  },
  terminal: {
    spawn: (req) => ipcRenderer.invoke(TERMINAL.spawn, req),
    resume: (req) => ipcRenderer.invoke(TERMINAL.resume, req),
    fork: (req) => ipcRenderer.invoke(TERMINAL.fork, req),
    write: (id, data) => ipcRenderer.send(TERMINAL.write, id, data),
    resize: (id, cols, rows) =>
      ipcRenderer.send(TERMINAL.resize, id, cols, rows),
    ack: (id, charCount) => ipcRenderer.send(TERMINAL.ack, id, charCount),
    kill: (id) => ipcRenderer.send(TERMINAL.kill, id),
    reattach: (id, cols, rows) =>
      ipcRenderer.invoke(TERMINAL.reattach, id, cols, rows),
    pickDirectory: () => ipcRenderer.invoke(TERMINAL.pickDirectory),
    // The two PUSH channels. Each returns an unsubscribe fn so a React effect can detach its exact
    // handler on cleanup — without it, every remount would stack another listener (a classic leak).
    onData: (cb) => {
      const handler = (
        _e: IpcRendererEvent,
        id: string,
        data: string,
        offset: number,
      ) => cb(id, data, offset);
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
  shellTerminal: {
    spawn: (req) => ipcRenderer.invoke(SHELL_TERMINAL.spawn, req),
    write: (id, data) => ipcRenderer.send(SHELL_TERMINAL.write, id, data),
    resize: (id, cols, rows) =>
      ipcRenderer.send(SHELL_TERMINAL.resize, id, cols, rows),
    ack: (id, charCount) => ipcRenderer.send(SHELL_TERMINAL.ack, id, charCount),
    kill: (id) => ipcRenderer.send(SHELL_TERMINAL.kill, id),
    onData: (cb) => {
      const handler = (
        _e: IpcRendererEvent,
        id: string,
        data: string,
        offset: number,
      ) => cb(id, data, offset);
      ipcRenderer.on(SHELL_TERMINAL.data, handler);
      return () => ipcRenderer.removeListener(SHELL_TERMINAL.data, handler);
    },
    onExit: (cb) => {
      const handler = (_e: IpcRendererEvent, id: string, code: number) =>
        cb(id, code);
      ipcRenderer.on(SHELL_TERMINAL.exit, handler);
      return () => ipcRenderer.removeListener(SHELL_TERMINAL.exit, handler);
    },
  },
  getPathForFile: (file) => webUtils.getPathForFile(file as File),
};

contextBridge.exposeInMainWorld("api", api);
