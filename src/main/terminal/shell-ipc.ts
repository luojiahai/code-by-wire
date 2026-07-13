import { app, ipcMain, type BrowserWindow, type IpcMainEvent } from "electron";
import { statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import {
  SHELL_TERMINAL,
  type ShellSpawnRequest,
  type ShellSpawnResult,
} from "@shared/shell-terminal";
import { createTerminalManager } from "./manager";
import { createPtyProcess } from "./pty-process";
import type { Recorder } from "./recorder";
import {
  resolveShellCommand,
  safeShellCwd,
  isExecutableFile,
  findOnPath,
} from "./shell-command";

/** Shell sessions revive scrollback renderer-side (hermes-style, localStorage) and this surface
 *  has no reattach handler, so the manager's required recorder dep would be a headless xterm
 *  burning memory per shell for a snapshot nobody asks for. Satisfy it with an inert stub. */
const stubRecorder = (): Recorder => ({
  write: () => {},
  resize: () => {},
  snapshot: () => Promise.resolve({ data: "", offset: 0 }),
  dispose: () => {},
});

function statKind(p: string): "dir" | "file" | null {
  try {
    return statSync(p).isDirectory() ? "dir" : "file";
  } catch {
    return null;
  }
}

/**
 * Register the shell-terminal IPC against one window: a SECOND terminal manager on its own
 * `shellterm:*` channels. Registry hooks are no-ops — shell sessions must never touch the
 * ManagedRegistry, so they can't pollute session discovery. Ptys die with the window and on
 * before-quit (kill before env teardown — the node-pty ThreadSafeFunction SIGABRT ordering).
 */
export function registerShellTerminalIpc({
  window,
  env,
}: {
  window: BrowserWindow;
  /** The shell child env (corrected PATH + buildShellEnv), resolved lazily per spawn. */
  env: () => NodeJS.ProcessEnv;
}): void {
  const manager = createTerminalManager({
    send: (id, data, offset) => {
      if (!window.isDestroyed())
        window.webContents.send(SHELL_TERMINAL.data, id, data, offset);
    },
    notifyExit: (id, code) => {
      if (!window.isDestroyed())
        window.webContents.send(SHELL_TERMINAL.exit, id, code);
    },
    onSpawned: () => {}, // never ManagedRegistry — a shell is not a session
    onClosed: () => {},
    createPty: createPtyProcess,
    createRecorder: stubRecorder,
    env,
  });

  ipcMain.handle(
    SHELL_TERMINAL.spawn,
    (_e, req: ShellSpawnRequest): ShellSpawnResult => {
      // Resolve against the same env the shell will run in, so a corrected PATH (packaged,
      // Finder-launched) also finds the shell override.
      const spawnEnv = env();
      const spec = resolveShellCommand({
        env: spawnEnv,
        platform: process.platform,
        isExecutable: isExecutableFile,
        findOnPath: (name) => findOnPath(name, spawnEnv),
      });
      const cwd = safeShellCwd({
        requested: req.cwd,
        home: homedir(),
        stat: statKind,
        resolve,
        dirname,
      });
      manager.launch({
        id: req.id,
        file: spec.file,
        args: spec.args,
        cwd,
        cols: req.cols,
        rows: req.rows,
      });
      return { cwd, shell: spec.name };
    },
  );
  const onWrite = (_e: IpcMainEvent, id: string, data: string) =>
    manager.write(id, data);
  const onResize = (_e: IpcMainEvent, id: string, cols: number, rows: number) =>
    manager.resize(id, cols, rows);
  const onAck = (_e: IpcMainEvent, id: string, charCount: number) =>
    manager.ack(id, charCount);
  const onKill = (_e: IpcMainEvent, id: string) => manager.kill(id);
  ipcMain.on(SHELL_TERMINAL.write, onWrite);
  ipcMain.on(SHELL_TERMINAL.resize, onResize);
  ipcMain.on(SHELL_TERMINAL.ack, onAck);
  ipcMain.on(SHELL_TERMINAL.kill, onKill);

  const onBeforeQuit = () => manager.disposeAll();
  app.on("before-quit", onBeforeQuit);

  window.on("closed", () => {
    manager.disposeAll();
    app.removeListener("before-quit", onBeforeQuit);
    ipcMain.removeHandler(SHELL_TERMINAL.spawn);
    ipcMain.removeListener(SHELL_TERMINAL.write, onWrite);
    ipcMain.removeListener(SHELL_TERMINAL.resize, onResize);
    ipcMain.removeListener(SHELL_TERMINAL.ack, onAck);
    ipcMain.removeListener(SHELL_TERMINAL.kill, onKill);
  });
}
