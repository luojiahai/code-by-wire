// src/renderer/src/workspace/panels/shell-view.ts
import type { BackgroundShell } from "@shared/types";
import type { AnsiColor } from "./ansi-to-html";
import { tNow } from "../../i18n";
import { DOCK_GLYPH, type DockStatus } from "./dock-status-glyph";

/** A shell's canonical dock status: running is active; killed is stopped; completed splits on the
 *  exit code (0 and undefined both read as clean → done, non-zero → failed). */
export function shellDockStatus(
  shell: Pick<BackgroundShell, "status" | "exitCode">,
): DockStatus {
  if (shell.status === "running") return "active";
  if (shell.status === "killed") return "stopped";
  return shell.exitCode ? "failed" : "done";
}

/** The status glyph + cbw tone for a shell row, read from the dock's canonical table
 *  (dock-status-glyph.ts) via shellDockStatus. Signature preserved from the pre-unification
 *  per-tab table so ShellsTab and the pill/detail helpers below are untouched. */
export function shellGlyph(
  shell: Pick<BackgroundShell, "status" | "exitCode">,
): { char: string; tone: string } {
  const g = DOCK_GLYPH[shellDockStatus(shell)];
  return { char: g.char, tone: g.tone };
}

/** The status pill for the drilled-in shell header: the row glyph + tone (reused straight from shellGlyph,
 *  so the pill can never drift from the list-row glyph the user drilled from) plus a one-word status label,
 *  read from the dock's shared status vocabulary (dock.status — also used by monitor-view.ts and
 *  DockTasks.tsx) so the word is resolved fresh per call, never captured at module scope. The pill
 *  carries the only color in the header. */
export function shellStatusPill(
  shell: Pick<BackgroundShell, "status" | "exitCode">,
): { glyph: string; label: string; tone: string } {
  const { char, tone } = shellGlyph(shell);
  const status = tNow().dock.status;
  // Glyph and tone are shellGlyph's; only the words are the pill's own. completed splits failed/clean on
  // the exit the same way shellGlyph splits ✕/✓ (0 and undefined both read clean).
  const label =
    shell.status === "running"
      ? status.running
      : shell.status === "killed"
        ? status.killed
        : shell.exitCode
          ? status.failed
          : status.completed;
  return { glyph: char, label, tone };
}

/** The Status + Runtime display strings for the Shell details modal. Pure so the modal's only real logic
 *  is unit-testable without a component-render harness. Status reuses shellStatusPill's glyph/word/tone,
 *  appending " (exit N)" on a non-zero exit; Runtime is the elapsed time while running, the final duration
 *  once done, or an em dash when no timestamp is known. */
export function shellDetailMeta(
  shell: Pick<
    BackgroundShell,
    "status" | "exitCode" | "durationMs" | "startMs"
  >,
  now: number,
): {
  statusGlyph: string;
  statusText: string;
  statusTone: string;
  runtime: string;
} {
  const pill = shellStatusPill(shell);
  const t = tNow();
  const statusText =
    shell.status === "completed" && shell.exitCode
      ? `${pill.label}${t.dock.shells.exitSuffix(shell.exitCode)}`
      : pill.label;
  const runtime =
    shell.status === "running" && shell.startMs !== undefined
      ? t.time.duration(now - shell.startMs)
      : shell.durationMs !== undefined
        ? t.time.duration(shell.durationMs)
        : "—";
  return {
    statusGlyph: pill.glyph,
    statusText,
    statusTone: pill.tone,
    runtime,
  };
}

/** A human label for dropped leading bytes, or "" when nothing was truncated. */
export function truncLabel(bytes: number): string {
  if (bytes <= 0) return "";
  const kb = Math.round(bytes / 1024);
  return tNow().dock.shells.truncated(kb);
}

// ANSI color → nearest cbw hue token, mapped by hue not by name. After the teal rebrand the cool slots
// shifted: `working` is the true blue and `primary` (wire) is the cyan-teal — so ANSI blue→working,
// cyan→primary. Green stays on `ok`; there's no bright-green token, so bright green falls back to it.
const BASE_CLASS: Record<AnsiColor, string> = {
  black: "text-fg-faint",
  red: "text-danger",
  green: "text-ok",
  yellow: "text-accent",
  blue: "text-working",
  magenta: "text-violet",
  cyan: "text-primary",
  white: "text-fg",
};

/** A few colors have a brighter cbw token; the rest reuse the base. */
const BRIGHT_CLASS: Partial<Record<AnsiColor, string>> = {
  yellow: "text-accent-bright",
  blue: "text-working-bright",
};

/** Map a parsed ANSI color to a cbw color class. */
export function ansiClass(fg: AnsiColor, bright = false): string {
  return (bright && BRIGHT_CLASS[fg]) || BASE_CLASS[fg];
}
