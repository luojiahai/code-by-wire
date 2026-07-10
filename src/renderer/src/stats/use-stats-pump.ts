import { useEffect } from "react";
import { atom } from "nanostores";
import type { ScanProgress } from "@shared/stats";
import { nextPumpDelayMs } from "./pump-schedule";

/** The pump's latest scan progress, for readers that render scan state (the Settings Stats-database
 *  card's lamp) without driving a scan of their own. null until the first tick lands. */
export const $scanProgress = atom<ScanProgress | null>(null);

/**
 * Drives the analytics scan for the app's lifetime, independent of the Stats view: one bounded scan
 * step per tick, brisk (40ms) while a backfill is filling in, then a gentle 5-minute idle cadence —
 * so transcripts land in the durable mirror before Claude Code's cleanupPeriodDays can delete them
 * (spec 2026-07-10). Deliberately does NOT pause on document.hidden: ingesting while the user isn't
 * looking is the point. StatsView's own poll is untouched; both drive the same idempotent,
 * mtime-gated scan, and a caught-up step is a no-op walk.
 */
export function useStatsPump(): void {
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function tick(): void {
      void window.api
        .pumpStats()
        .then((progress) => {
          if (!alive) return;
          $scanProgress.set(progress);
          timer = setTimeout(tick, nextPumpDelayMs(progress));
        })
        .catch(() => {
          // The handler never rejects by design; reaching here means the IPC bridge itself failed.
          // Keep the last progress and retry at the idle cadence.
          if (!alive) return;
          timer = setTimeout(tick, nextPumpDelayMs(null));
        });
    }
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);
}
