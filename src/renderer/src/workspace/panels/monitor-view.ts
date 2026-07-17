// src/renderer/src/workspace/panels/monitor-view.ts
import type { Monitor } from "@shared/types";
import { tNow } from "../../i18n";
import { DOCK_GLYPH, type DockStatus } from "./dock-status-glyph";

/** A monitor's canonical dock status. Monitors carry no exit code — completed is pass, failed is
 *  fail, killed/stopped are the user's own call. */
export function monitorDockStatus(
  monitor: Pick<Monitor, "status">,
): DockStatus {
  switch (monitor.status) {
    case "running":
      return "active";
    case "completed":
      return "done";
    case "failed":
      return "failed";
    default: // killed | stopped
      return "stopped";
  }
}

/** The status glyph + cbw tone for a monitor row, read from the dock's canonical table
 *  (dock-status-glyph.ts) via monitorDockStatus. Signature preserved. */
export function monitorGlyph(monitor: Pick<Monitor, "status">): {
  char: string;
  tone: string;
} {
  const g = DOCK_GLYPH[monitorDockStatus(monitor)];
  return { char: g.char, tone: g.tone };
}

/** The status pill for the drilled-in monitor header: monitorGlyph's glyph/tone (so the pill can never
 *  drift from the list-row glyph) plus the one-word status as its label, read from the dock's shared
 *  status vocabulary (dock.status — also used by shell-view.ts and DockTasks.tsx) so the word is
 *  resolved fresh per call, never captured at module scope. */
export function monitorStatusPill(monitor: Pick<Monitor, "status">): {
  glyph: string;
  label: string;
  tone: string;
} {
  const { char, tone } = monitorGlyph(monitor);
  return { glyph: char, label: tNow().dock.status[monitor.status], tone };
}

/** The Status + Runtime display strings for the Monitor details modal. Pure, so the modal's only real
 *  logic is unit-testable without a component-render harness. Runtime is the elapsed time while running,
 *  the final duration once ended, or an em dash when no timestamp is known. */
export function monitorDetailMeta(
  monitor: Pick<Monitor, "status" | "durationMs" | "startMs">,
  now: number,
): {
  statusGlyph: string;
  statusText: string;
  statusTone: string;
  runtime: string;
} {
  const pill = monitorStatusPill(monitor);
  const duration = tNow().time.duration;
  const runtime =
    monitor.status === "running" && monitor.startMs !== undefined
      ? duration(now - monitor.startMs)
      : monitor.durationMs !== undefined
        ? duration(monitor.durationMs)
        : "—";
  return {
    statusGlyph: pill.glyph,
    statusText: pill.label,
    statusTone: pill.tone,
    runtime,
  };
}
