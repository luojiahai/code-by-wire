/** The repo whose GitHub releases electron-updater reads; used to build the release-notes link. */
const RELEASES_BASE = "https://github.com/luojiahai/code-by-wire/releases/tag";

/** The update lifecycle, as a discriminated union the renderer renders directly.
 *  `unsupported` is the dev/unpacked state (electron-updater can't run unpacked). */
export type UpdatePhase =
  | { kind: "unsupported" }
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "upToDate"; checkedAt: number }
  | {
      kind: "available";
      version: string;
      releaseDate?: string;
      notesUrl: string;
    }
  | {
      kind: "downloading";
      version: string;
      percent: number;
      transferred: number;
      total: number;
    }
  | { kind: "downloaded"; version: string }
  | { kind: "error"; message: string };

/** The whole update surface: the running version plus the current phase. */
export interface UpdateState {
  currentVersion: string;
  phase: UpdatePhase;
}

/** Events the main-process controller feeds the reducer, translated from electron-updater's emitter.
 *  Electron-free so the reducer stays pure and testable. Timestamps are stamped by the controller
 *  (never read inside the reducer), so tests can pin them. */
export type UpdaterEvent =
  | { type: "checking" }
  | { type: "available"; version: string; releaseDate?: string }
  | { type: "not-available"; at: number }
  | { type: "progress"; percent: number; transferred: number; total: number }
  | { type: "downloaded"; version: string }
  | { type: "error"; message: string };

/** The GitHub release-notes URL for a version (release tags are `v<version>`). */
export function releaseNotesUrl(version: string): string {
  return `${RELEASES_BASE}/v${version}`;
}

/** Whether an update is pending — found, downloading, or awaiting restart. Drives the sidebar
 *  gear badge and the Settings About-row dot; clears only when the update installs (the new
 *  version relaunches into `idle`). */
export function isUpdatePending(phase: UpdatePhase): boolean {
  return (
    phase.kind === "available" ||
    phase.kind === "downloading" ||
    phase.kind === "downloaded"
  );
}

/** State before any check: `unsupported` in dev (electron-updater can't run unpacked), else `idle`. */
export function initialUpdateState(
  currentVersion: string,
  packaged: boolean,
): UpdateState {
  return {
    currentVersion,
    phase: packaged ? { kind: "idle" } : { kind: "unsupported" },
  };
}

/** The version an in-flight download is for, carried from the prior available/downloading phase
 *  (electron-updater's download-progress event carries no version). */
function versionInFlight(prev: UpdateState): string {
  const p = prev.phase;
  if (
    p.kind === "available" ||
    p.kind === "downloading" ||
    p.kind === "downloaded"
  )
    return p.version;
  return "";
}

/** Pure reducer: fold one updater event into the next state. `unsupported` is sticky (a dev build never
 *  leaves it); `currentVersion` is always carried forward. */
export function nextUpdateState(
  prev: UpdateState,
  ev: UpdaterEvent,
): UpdateState {
  if (prev.phase.kind === "unsupported") return prev;
  const base = { currentVersion: prev.currentVersion };
  switch (ev.type) {
    case "checking":
      // A check firing mid-download (shouldn't happen) must not wipe progress.
      if (prev.phase.kind === "downloading") return prev;
      return { ...base, phase: { kind: "checking" } };
    case "available":
      return {
        ...base,
        phase: {
          kind: "available",
          version: ev.version,
          releaseDate: ev.releaseDate,
          notesUrl: releaseNotesUrl(ev.version),
        },
      };
    case "not-available":
      return { ...base, phase: { kind: "upToDate", checkedAt: ev.at } };
    case "progress":
      return {
        ...base,
        phase: {
          kind: "downloading",
          version: versionInFlight(prev),
          percent: Math.max(0, Math.min(100, ev.percent)),
          transferred: ev.transferred,
          total: ev.total,
        },
      };
    case "downloaded":
      return { ...base, phase: { kind: "downloaded", version: ev.version } };
    case "error":
      return { ...base, phase: { kind: "error", message: ev.message } };
  }
}
