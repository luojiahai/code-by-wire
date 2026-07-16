import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import type { StatsDbInfo } from "@shared/ipc";
import { localDayKey } from "@shared/stats";
import { formatBytes } from "@shared/format";
import { Card } from "../shell/page-primitives";
import {
  SubsystemHeader,
  ReadoutRow,
  type LampTone,
} from "./system-primitives";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { $scanProgress, kickStatsPump } from "../stats/use-stats-pump";
import { useI18n } from "../i18n";

/** The dbinfo poll cadence while the System section is open — the stats warm cadence, so a running
 *  backfill's size/counts tick along with the lamp. */
const POLL_MS = 1500;

/**
 * The Stats database subsystem card (design spec 2026-07-10): the durable analytics mirror's
 * location, size, and contents, on the same header-rail/readout anatomy as the CLI and Statusline
 * cards. The lamp renders the background pump's progress ($scanProgress) — this card never drives a
 * scan of its own. Reset lives here (moved from the Stats header) behind the shared ConfirmDialog,
 * framed by a danger band so the irreversibility is visible before the click: the store outlives
 * Claude Code's transcript cleanup, so a rebuild-from-disk can only see what cleanup has spared.
 */
export function StatsDbCard() {
  const { t } = useI18n();
  const progress = useStore($scanProgress);
  const [info, setInfo] = useState<StatsDbInfo | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetError, setResetError] = useState(false);

  useEffect(() => {
    let alive = true;
    let inFlight = false;
    async function tick(): Promise<void> {
      if (inFlight) return;
      inFlight = true;
      try {
        const i = await window.api.statsDbInfo();
        if (alive) setInfo(i);
      } catch {
        // main never rejects by design; a torn bridge keeps the last readout
      } finally {
        inFlight = false;
      }
    }
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const backfilling = progress !== null && !progress.done;
  const tone: LampTone =
    progress === null ? "idle" : backfilling ? "warn" : "live";
  const word =
    progress === null
      ? t.settings.statsDb.stateChecking
      : backfilling
        ? t.settings.statsDb.backfilling(
            progress.filesDone,
            progress.filesTotal,
          )
        : t.settings.statsDb.mirrored;

  async function handleReset(): Promise<void> {
    setConfirmReset(false);
    try {
      const r = await window.api.resetAnalytics();
      setResetError(!r.ok);
      if (r.ok) {
        // The store is now empty. Optimistically flip the lamp to BACKFILLING (and disable Reset)
        // this frame so the card never reads a stale "MIRRORED" over a just-cleared store, then wake
        // the pump to run the rebuild now — with the Stats view closed it may be parked at the 5-min
        // idle cadence, and its own tick is the only other writer of $scanProgress.
        $scanProgress.set({ filesTotal: 0, filesDone: 0, done: false });
        kickStatsPump();
      }
    } catch {
      setResetError(true);
    }
  }

  return (
    <Card title={t.settings.statsDb.title}>
      <SubsystemHeader tone={tone} word={word} />
      <ReadoutRow
        label={t.settings.statsDb.location}
        value={info ? info.path : "—"}
      />
      <ReadoutRow
        label={t.settings.statsDb.size}
        value={info ? formatBytes(info.sizeBytes) : "—"}
      />
      <ReadoutRow
        label={t.settings.statsDb.ingested}
        value={
          info
            ? t.settings.statsDb.ingestedValue(
                info.turns.toLocaleString("en-US"),
                info.sessions.toLocaleString("en-US"),
              )
            : "—"
        }
      />
      <ReadoutRow
        label={t.settings.statsDb.history}
        value={
          info && info.oldestTs !== null
            ? t.settings.statsDb.since(localDayKey(info.oldestTs))
            : "—"
        }
      />
      {/* Danger band (mockup option A): red wash + mono headline, no left rule. No border-t — the
          History row above keeps its own border-b because this band, not it, is the :last-child. */}
      <div className="flex items-center gap-3 bg-danger/5 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-meta tracking-[0.1em] text-danger">
            {t.settings.statsDb.dangerHeadline}
          </div>
          <div className="mt-1 text-aux text-fg-muted">
            {t.settings.statsDb.dangerBody}
          </div>
          {resetError && (
            <div className="mt-1 text-meta text-danger">
              {t.settings.statsDb.resetError}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setResetError(false);
            setConfirmReset(true);
          }}
          disabled={backfilling}
          className="inline-flex shrink-0 items-center rounded-md border border-danger/40 px-2.5 py-1 text-aux text-danger transition-colors hover:border-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t.settings.statsDb.reset}
        </button>
      </div>
      {confirmReset && (
        <ConfirmDialog
          title={t.settings.statsDb.confirmTitle}
          body={t.settings.statsDb.confirmBody}
          confirmLabel={t.settings.statsDb.reset}
          cancelLabel={t.common.cancel}
          tone="danger"
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => void handleReset()}
        />
      )}
    </Card>
  );
}
