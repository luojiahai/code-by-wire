// src/renderer/src/workspace/panels/dock-status-glyph.ts
import type { Subagent, Task } from "@shared/types";

/** The Activity dock's canonical status vocabulary (2026-07-17 spec §3). Every tab's domain status
 *  maps onto one of these before rendering, so equivalent states can't drift apart across tabs. */
export type DockStatus =
  | "pending"
  | "blocked"
  | "active"
  | "done"
  | "failed"
  | "stopped";

/** Glyph + cbw tone per canonical status — the one table all four tabs read. `animate` marks the
 *  status as pulsing; call sites apply DOCK_GLYPH_PULSE for it. done is green (the theme's own ok
 *  semantic, previously only Shells/Monitors); active is the pulsing dot (previously a static ◐ in
 *  Tasks/Subagents). pending/blocked/failed/stopped carry over unchanged. */
export const DOCK_GLYPH: Record<
  DockStatus,
  { char: string; tone: string; animate?: boolean }
> = {
  pending: { char: "○", tone: "text-(--ui-text-secondary)" },
  blocked: { char: "⊘", tone: "text-accent-bright" },
  active: { char: "●", tone: "text-working-bright", animate: true },
  done: { char: "✓", tone: "text-ok" },
  failed: { char: "✕", tone: "text-danger" },
  stopped: { char: "■", tone: "text-fg-faint" },
};

/** The `animate` flag's class string — the pulse plus its reduced-motion guard, defined once so no
 *  call site can forget the guard. */
export const DOCK_GLYPH_PULSE = "animate-pulse-soft motion-reduce:animate-none";

/** Tasks tab domain statuses → canonical. Tasks has no failed/stopped equivalent by design. */
export function taskDockStatus(status: Task["status"]): DockStatus {
  switch (status) {
    case "completed":
      return "done";
    case "in_progress":
      return "active";
    case "blocked":
      return "blocked";
    case "pending":
      return "pending";
  }
}

/** Subagents tab domain statuses → canonical. Subagents has no pending/blocked equivalent. */
export function subagentDockStatus(status: Subagent["status"]): DockStatus {
  switch (status) {
    case "working":
      return "active";
    case "done":
      return "done";
    case "failed":
      return "failed";
    case "stopped":
      return "stopped";
  }
}
