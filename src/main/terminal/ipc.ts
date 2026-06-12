import {
  app,
  dialog,
  ipcMain,
  type BrowserWindow,
  type IpcMainEvent,
} from "electron";
import type { Session } from "@shared/types";
import type { ModelId } from "@shared/models";
import {
  TERMINAL,
  type SpawnRequest,
  type AdoptRequest,
  type AdoptResult,
} from "@shared/terminal";
import { hydrate } from "../db/store";
import { projectFromCwd } from "../project-name";
import type { ManagedRegistry } from "../managed-registry";
import { createTerminalManager } from "./manager";
import { createPtyProcess } from "./pty-process";

/**
 * Build the optimistic Managed draft the renderer shows the instant a session is spawned, before
 * discovery has indexed the real process. Hydrated from zero usage so the derived display fields
 * (context %, equiv value) are well-formed; the real row supersedes it on the next sync.
 */
function draftSession(id: string, cwd: string, model: ModelId): Session {
  const project = projectFromCwd(cwd);
  return hydrate({
    id,
    title: project,
    project,
    branch: undefined,
    state: "working",
    management: "managed",
    model,
    lastActivityMs: Date.now(),
    awaitingUser: false,
    transcriptMtimeMs: 0,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    },
    contextTokens: 0,
  });
}

/**
 * Register the Managed-terminal IPC against one window. The manager pushes batched output and exit to
 * that window's renderer; the registry learns each spawned id so the provider labels it Managed. Ptys
 * die with the window (Managed sessions don't outlive the app — see the plan's scope boundary).
 */
export function registerTerminalIpc({
  window,
  managed,
  resolveAdoptTarget,
  env,
}: {
  window: BrowserWindow;
  managed: ManagedRegistry;
  resolveAdoptTarget: (id: string) => { alive: boolean; cwd: string } | null;
  /** Returns the env for spawned `claude` sessions, carrying the PATH `claude` lives on. Called lazily on
   *  the first spawn (see `shellPath`) and memoized, because a packaged .app inherits launchd's bare PATH,
   *  not the user's shell PATH. Omitted in tests/dev, where the manager falls back to `process.env`. */
  env?: () => NodeJS.ProcessEnv;
}): { rename: (from: string, to: string) => void } {
  const manager = createTerminalManager({
    send: (id, data) => {
      if (!window.isDestroyed())
        window.webContents.send(TERMINAL.data, id, data);
    },
    notifyExit: (id, code) => {
      if (!window.isDestroyed())
        window.webContents.send(TERMINAL.exit, id, code);
    },
    onSpawned: (id, pid) => managed.add(id, pid),
    onClosed: (id) => managed.remove(id),
    // The composition root: this is the one place node-pty is injected, so the manager (and its tests)
    // stay free of the native addon.
    createPty: createPtyProcess,
    env,
  });

  // The renderer mints the id and stands up its terminal BEFORE calling spawn, so the very first pty
  // bytes land on a live handle (no dropped output, no leaked flow-control credit). We spawn against
  // the id it sends and echo back the optimistic draft for that id.
  ipcMain.handle(TERMINAL.spawn, (_e, req: SpawnRequest): Session => {
    manager.spawn({
      id: req.id,
      cwd: req.cwd,
      model: req.model,
      cols: req.cols,
      rows: req.rows,
    });
    return draftSession(req.id, req.cwd, req.model);
  });
  // Adopt an Ended session: resume it under its own id. The liveness re-check here is the guarantee
  // behind the Ended-only state gate — a session that came back to life since the last sync is refused,
  // so two processes never share one Transcript. cwd is resolved in main, not trusted from the renderer.
  ipcMain.handle(TERMINAL.adopt, (_e, req: AdoptRequest): AdoptResult => {
    const target = resolveAdoptTarget(req.id);
    if (!target) return { ok: false, reason: "unresolvable" };
    if (target.alive) return { ok: false, reason: "alive" };
    manager.adopt({
      id: req.id,
      cwd: target.cwd,
      cols: req.cols,
      rows: req.rows,
    });
    return { ok: true };
  });
  const onWrite = (_e: IpcMainEvent, id: string, data: string) =>
    manager.write(id, data);
  const onResize = (_e: IpcMainEvent, id: string, cols: number, rows: number) =>
    manager.resize(id, cols, rows);
  const onAck = (_e: IpcMainEvent, id: string, charCount: number) =>
    manager.ack(id, charCount);
  const onKill = (_e: IpcMainEvent, id: string) => manager.kill(id);
  ipcMain.on(TERMINAL.write, onWrite);
  ipcMain.on(TERMINAL.resize, onResize);
  ipcMain.on(TERMINAL.ack, onAck);
  ipcMain.on(TERMINAL.kill, onKill);
  ipcMain.handle(TERMINAL.pickDirectory, async (): Promise<string | null> => {
    const r = await dialog.showOpenDialog(window, {
      properties: ["openDirectory", "createDirectory"],
    });
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0];
  });

  // Also kill ptys on app quit: a quit can tear the main process down without ever emitting the
  // window's 'closed' event, which would otherwise orphan the spawned `claude` children.
  const onBeforeQuit = () => manager.disposeAll();
  app.on("before-quit", onBeforeQuit);

  // Follow a /clear: re-key the live pty to its new session id, then tell this window's renderer to move
  // its terminal handle and selection onto `to`. The managed-registry relabel is the caller's (the sync
  // reconcile), so by the next snapshot `to` reads Managed and `from` derives as an Ended ghost.
  const rename = (from: string, to: string): void => {
    manager.rename(from, to);
    if (!window.isDestroyed())
      window.webContents.send(TERMINAL.rename, from, to);
  };

  window.on("closed", () => {
    manager.disposeAll();
    app.removeListener("before-quit", onBeforeQuit);
    ipcMain.removeHandler(TERMINAL.spawn);
    ipcMain.removeHandler(TERMINAL.adopt);
    ipcMain.removeHandler(TERMINAL.pickDirectory);
    ipcMain.removeListener(TERMINAL.write, onWrite);
    ipcMain.removeListener(TERMINAL.resize, onResize);
    ipcMain.removeListener(TERMINAL.ack, onAck);
    ipcMain.removeListener(TERMINAL.kill, onKill);
  });

  return { rename };
}
