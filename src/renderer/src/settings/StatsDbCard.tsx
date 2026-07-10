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
import { $scanProgress } from "../stats/use-stats-pump";

/** The dbinfo poll cadence while the System section is open — the stats warm cadence, so a running
 *  backfill's size/counts tick along with the lamp. */
const POLL_MS = 1500;

// Copy fixed by the design spec (2026-07-10) — do not reword.
const DANGER_HEADLINE = "IRREVERSIBLE BEYOND RETENTION";
const DANGER_BODY =
  "Rebuilds from transcripts on disk. History older than Claude Code's cleanup window is lost for good.";

/**
 * The Stats database subsystem card (design spec 2026-07-10): the durable analytics mirror's
 * location, size, and contents, on the same header-rail/readout anatomy as the CLI and Statusline
 * cards. The lamp renders the background pump's progress ($scanProgress) — this card never drives a
 * scan of its own. Reset lives here (moved from the Stats header) behind the shared ConfirmDialog,
 * framed by a danger band so the irreversibility is visible before the click: the store outlives
 * Claude Code's transcript cleanup, so a rebuild-from-disk can only see what cleanup has spared.
 */
export function StatsDbCard() {
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
      ? "CHECKING"
      : backfilling
        ? `BACKFILLING · ${progress.filesDone}/${progress.filesTotal}`
        : "MIRRORED";

  async function handleReset(): Promise<void> {
    setConfirmReset(false);
    try {
      const r = await window.api.resetAnalytics();
      setResetError(!r.ok);
    } catch {
      setResetError(true);
    }
  }

  return (
    <Card title="Stats database">
      <SubsystemHeader tone={tone} word={word} />
      <ReadoutRow label="Location" value={info ? info.path : "—"} />
      <ReadoutRow
        label="Size"
        value={info ? formatBytes(info.sizeBytes) : "—"}
      />
      <ReadoutRow
        label="Ingested"
        value={
          info
            ? `${info.turns.toLocaleString("en-US")} turns · ${info.sessions.toLocaleString("en-US")} sessions`
            : "—"
        }
      />
      <ReadoutRow
        label="History"
        value={
          info && info.oldestTs !== null
            ? `since ${localDayKey(info.oldestTs)}`
            : "—"
        }
      />
      {/* Danger band (mockup option A): red wash + mono headline, no left rule. No border-t — the
          History row above keeps its own border-b because this band, not it, is the :last-child. */}
      <div className="flex items-center gap-3 bg-danger/5 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-meta tracking-[0.1em] text-danger">
            {DANGER_HEADLINE}
          </div>
          <div className="mt-1 text-aux text-fg-muted">{DANGER_BODY}</div>
          {resetError && (
            <div className="mt-1 text-meta text-danger">
              Couldn&apos;t reset. Please try again.
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
          Reset…
        </button>
      </div>
      {confirmReset && (
        <ConfirmDialog
          title="Reset the stats database?"
          body="Clears the computed stats and rebuilds them from the transcripts on disk. History older than Claude Code's transcript retention is lost for good."
          confirmLabel="Reset"
          tone="danger"
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => void handleReset()}
        />
      )}
    </Card>
  );
}
