import { autoUpdater } from "electron-updater";
import {
  initialUpdateState,
  nextUpdateState,
  type UpdateState,
  type UpdaterEvent,
} from "@shared/update";

/** The main-process update surface the IPC layer calls. */
export interface Updater {
  getState(): UpdateState;
  /** Trigger a check; resolves to the resulting state. A no-op (returns current state) in dev or while
   *  a check/download is already in flight. */
  check(): Promise<UpdateState>;
  /** Download the available update. No-op in dev or while already downloading. */
  download(): Promise<void>;
  /** Quit and install a downloaded update (the app quits). No-op in dev. */
  quitAndInstall(): void;
}

/**
 * Owns electron-updater's autoUpdater, folds its events through the pure reducer, and pushes every new
 * state to the renderer via `deps.send`. In dev (`isPackaged === false`) it never touches autoUpdater
 * (which throws when unpacked) and stays in the `unsupported` phase, so the renderer hides the card.
 *
 * Config: manual download (`autoDownload = false`) and install-on-next-quit
 * (`autoInstallOnAppQuit = true`) — once downloaded, the update applies whenever the app next quits;
 * `quitAndInstall()` applies it immediately. Stable channel only (`allowPrerelease = false`).
 */
export function createUpdater(deps: {
  send: (state: UpdateState) => void;
  isPackaged: boolean;
  currentVersion: string;
}): Updater {
  let state = initialUpdateState(deps.currentVersion, deps.isPackaged);
  const apply = (ev: UpdaterEvent): void => {
    state = nextUpdateState(state, ev);
    deps.send(state);
  };

  if (deps.isPackaged) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.on("checking-for-update", () => apply({ type: "checking" }));
    autoUpdater.on("update-available", (info) =>
      apply({
        type: "available",
        version: info.version,
        releaseDate: info.releaseDate,
      }),
    );
    autoUpdater.on("update-not-available", () =>
      apply({ type: "not-available", at: Date.now() }),
    );
    autoUpdater.on("download-progress", (p) =>
      apply({
        type: "progress",
        percent: p.percent,
        transferred: p.transferred,
        total: p.total,
      }),
    );
    autoUpdater.on("update-downloaded", (info) =>
      apply({ type: "downloaded", version: info.version }),
    );
    autoUpdater.on("error", (err) =>
      apply({ type: "error", message: friendlyError(err) }),
    );
  }

  return {
    getState: () => state,
    check: async () => {
      if (!deps.isPackaged) return state;
      if (state.phase.kind === "checking" || state.phase.kind === "downloading")
        return state;
      try {
        await autoUpdater.checkForUpdates();
      } catch (err) {
        apply({ type: "error", message: friendlyError(err) });
      }
      return state;
    },
    download: async () => {
      if (!deps.isPackaged || state.phase.kind !== "available") return;
      try {
        await autoUpdater.downloadUpdate();
      } catch (err) {
        apply({ type: "error", message: friendlyError(err) });
      }
    },
    quitAndInstall: () => {
      if (deps.isPackaged && state.phase.kind === "downloaded")
        autoUpdater.quitAndInstall();
    },
  };
}

/** A short, renderer-facing message from an updater error. */
function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // electron-updater prefixes some errors with a code line; keep the first line, trimmed.
  return msg.split("\n")[0].trim() || "Update failed.";
}
