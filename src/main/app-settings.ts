import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readTextOrNull } from "./claude-config";

/** code-by-wire's own settings, stored under Electron's userData — NOT ~/.claude (that's Claude's). */
export interface AppSettings {
  /** Absolute path to a claude binary, overriding PATH resolution. Works for Finder launches,
   *  unlike the CBW_CLAUDE_BIN env var. */
  claudeBinPath?: string | null;
  /** Whether to check for app updates on launch. Missing means on; the launch check reads
   *  `read().autoCheckUpdates ?? true`. */
  autoCheckUpdates?: boolean;
  /** Whether the statusLine capture wrapper is installed at launch and active. Missing means on;
   *  callers read `read().statuslineEnabled ?? true`. */
  statuslineEnabled?: boolean;
  /** Whether to fire a native notification when a session starts awaiting input. Missing means on;
   *  callers read `read().notifyOnAwaiting ?? true`. */
  notifyOnAwaiting?: boolean;
}

export interface AppSettingsStore {
  read(): AppSettings;
  setClaudeBinPath(path: string | null): void;
  setAutoCheckUpdates(enabled: boolean): void;
  setStatuslineEnabled(enabled: boolean): void;
  setNotifyOnAwaiting(enabled: boolean): void;
}

export interface AppSettingsDeps {
  /** Directory to store settings.json in (the composition root passes app.getPath("userData")). */
  dir: string;
}

export function createAppSettingsStore(
  deps: AppSettingsDeps,
): AppSettingsStore {
  const file = join(deps.dir, "settings.json");

  function read(): AppSettings {
    const raw = readTextOrNull(file);
    if (raw === null) return {};
    try {
      const v: unknown = JSON.parse(raw);
      return v && typeof v === "object" && !Array.isArray(v) ? v : {};
    } catch {
      return {}; // a corrupt file reads as "no settings" rather than crashing the app
    }
  }

  function write(next: AppSettings): void {
    mkdirSync(deps.dir, { recursive: true });
    writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
  }

  return {
    read,
    setClaudeBinPath(path) {
      write({ ...read(), claudeBinPath: path });
    },
    setAutoCheckUpdates(enabled) {
      write({ ...read(), autoCheckUpdates: enabled });
    },
    setStatuslineEnabled(enabled) {
      write({ ...read(), statuslineEnabled: enabled });
    },
    setNotifyOnAwaiting(enabled) {
      write({ ...read(), notifyOnAwaiting: enabled });
    },
  };
}
