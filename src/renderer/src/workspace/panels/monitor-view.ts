// src/renderer/src/workspace/panels/monitor-view.ts
import type { Monitor } from "@shared/types";
import { formatDuration } from "@shared/format";

/** The status glyph + cbw tone for a monitor row. running pulses blue; completed reads green/✓; failed
 *  red/✕; killed or stopped a calm grey square. Monitors carry no exit code — the status is pass/fail. */
export function monitorGlyph(monitor: Pick<Monitor, "status">): {
  char: string;
  tone: string;
} {
  switch (monitor.status) {
    case "running":
      return { char: "●", tone: "text-working-bright" };
    case "completed":
      return { char: "✓", tone: "text-ok" };
    case "failed":
      return { char: "✕", tone: "text-danger" };
    default: // killed | stopped
      return { char: "■", tone: "text-fg-faint" };
  }
}

/** The status pill for the drilled-in monitor header: monitorGlyph's glyph/tone (so the pill can never
 *  drift from the list-row glyph) plus the one-word status as its label. */
export function monitorStatusPill(monitor: Pick<Monitor, "status">): {
  glyph: string;
  label: string;
  tone: string;
} {
  const { char, tone } = monitorGlyph(monitor);
  return { glyph: char, label: monitor.status, tone };
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
  const runtime =
    monitor.status === "running" && monitor.startMs !== undefined
      ? formatDuration(now - monitor.startMs)
      : monitor.durationMs !== undefined
        ? formatDuration(monitor.durationMs)
        : "—";
  return {
    statusGlyph: pill.glyph,
    statusText: pill.label,
    statusTone: pill.tone,
    runtime,
  };
}
