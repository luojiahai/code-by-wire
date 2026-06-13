import { ipcMain } from "electron";
import { IPC, type OverviewData } from "@shared/ipc";
import type { Provider } from "./provider/types";
import type { SqliteDb } from "./db/driver";
import type { StatusLineReader } from "@shared/statusline";
import type { ApiConfig } from "./settings/api-config";
import type { ModelDefaults } from "@shared/models";
import {
  deriveAccount,
  overlaySessions,
  freshestBySession,
  CAPTURE_STALE_MS,
} from "@shared/statusline";
import { getOverview } from "./db/store";
import { syncSessions } from "./sync";

export interface IpcDeps {
  db: SqliteDb;
  provider: Provider;
  /** Live statusLine captures. Defaults to "no captures" so the index still serves without them. */
  statusLine?: StatusLineReader;
  /** Reads the logged-in account email (cached by the caller). Defaults to no email. */
  accountEmail?: () => string | null;
  /** Reads the configured API-billing config (cached by the caller). Defaults to no config. */
  apiConfig?: () => ApiConfig | null;
  /** Reads the configured model defaults: per-family overrides, default family, allowed families
   *  (cached by the caller). Defaults to empty overrides. */
  modelDefaults?: () => ModelDefaults;
  /** Runs at the start of every sync, before discovery. Used to follow `/clear` rotations so the
   *  provider labels a rotated session correctly on the same tick. Its failure must not block the sync. */
  beforeSync?: () => void;
}

export function registerIpc({
  db,
  provider,
  statusLine,
  accountEmail,
  apiConfig,
  modelDefaults,
  beforeSync,
}: IpcDeps): { sync: () => void } {
  const reader: StatusLineReader = statusLine ?? { read: () => [] };
  const readEmail = accountEmail ?? ((): string | null => null);
  const readApi = apiConfig ?? ((): ApiConfig | null => null);
  const readDefaults =
    modelDefaults ?? ((): ModelDefaults => ({ overrides: {} }));

  const sync = (): void => {
    try {
      beforeSync?.();
    } catch (err) {
      // A reconcile failure (e.g. ~/.claude briefly unreadable) must not cost the session list.
      console.error("rotation reconcile failed; continuing with sync", err);
    }
    syncSessions(db, provider);
  };

  /** The index snapshot enriched with the live statusLine overlay: per-session cost/context/lines, plus
   *  the app-wide account. Both handlers go through here so the list and the account share one read. The
   *  freshest-per-session map feeds both the overlay and the account, so the captures are walked once. */
  const overviewNow = (): OverviewData => {
    const now = Date.now();
    const base = getOverview(db);
    const byId = freshestBySession(reader.read());
    // deriveAccount owns the whole billing decision: subscription (live window) vs api (a base URL and no
    // rate_limits evidence) vs unknown. Pass the configured endpoint so it can surface api billing in one place.
    const account = deriveAccount(
      byId.values(),
      now,
      CAPTURE_STALE_MS,
      readApi(),
    );
    if (account?.billingMode === "subscription") {
      // Subscription identity: the oauthAccount email (ADR-0001). Attached only here, only for a
      // subscription — beside gateway billing it would mislabel, so a non-subscription account never gets it.
      const email = readEmail();
      if (email) account.email = email;
    }
    return {
      sessions: overlaySessions(base.sessions, byId),
      account,
    };
  };

  ipcMain.handle(IPC.overview, () => overviewNow());
  ipcMain.handle(IPC.refresh, () => {
    try {
      sync();
    } catch (err) {
      // A failed refresh (e.g. ~/.claude briefly unreadable) must not reject to the renderer or
      // drop the list. Serve the last-known rows and let the next Refresh retry, like launch does.
      console.error("refresh sync failed; serving last-known rows", err);
    }
    return overviewNow();
  });
  ipcMain.handle(IPC.capabilities, () => provider.capabilities);
  ipcMain.handle(IPC.modelDefaults, () => readDefaults());
  ipcMain.handle(IPC.readTranscript, (_e, id: string, sinceMtimeMs?: number) =>
    provider.readTranscript(id, sinceMtimeMs),
  );
  ipcMain.handle(IPC.readTasks, (_e, id: string, sinceMtimeMs?: number) =>
    provider.readTasks(id, sinceMtimeMs),
  );
  ipcMain.handle(IPC.readMetrics, (_e, id: string, sinceMtimeMs?: number) =>
    provider.readMetrics(id, sinceMtimeMs),
  );

  return { sync };
}
