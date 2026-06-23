// src/renderer/src/workspace/panels/shell-view.ts
import type { BackgroundShell } from "@shared/types";
import type { AnsiColor } from "./ansi-to-html";
import { formatDuration } from "@shared/format";

/** The status glyph + cbw tone for a shell row. A completed shell reads green/✓ on a clean exit and
 *  red/✕ on a non-zero code; running pulses blue; killed is a calm grey square. */
export function shellGlyph(
  shell: Pick<BackgroundShell, "status" | "exitCode">,
): { char: string; tone: string } {
  if (shell.status === "running")
    return { char: "●", tone: "text-working-bright" };
  if (shell.status === "killed") return { char: "■", tone: "text-fg-faint" };
  // completed: a non-zero exit reads as failed (0 and undefined both read as clean)
  return shell.exitCode
    ? { char: "✕", tone: "text-danger" }
    : { char: "✓", tone: "text-ok" };
}

/** The status pill for the drilled-in shell header: the row glyph, a one-word status label, and the cbw
 *  tone class. The pill carries the only color in the header, matched to the list-row glyph the user
 *  drilled from. */
export function shellStatusPill(
  shell: Pick<BackgroundShell, "status" | "exitCode">,
): { glyph: string; label: string; tone: string } {
  if (shell.status === "running")
    return { glyph: "●", label: "running", tone: "text-working-bright" };
  if (shell.status === "killed")
    return { glyph: "■", label: "killed", tone: "text-fg-faint" };
  // completed: a non-zero exit reads failed (0 and undefined both read clean), matching shellGlyph.
  return shell.exitCode
    ? { glyph: "✕", label: "failed", tone: "text-danger" }
    : { glyph: "✓", label: "completed", tone: "text-ok" };
}

/** The Bash-background trigger in words, for the header meta row. */
export function triggerLabel(trigger: BackgroundShell["trigger"]): string {
  switch (trigger) {
    case "auto":
      return "auto-backgrounded";
    case "user":
      return "Ctrl-B";
    default:
      return "run in background";
  }
}

/** The header meta segments, in order: exit code (once known), duration — or `elapsed <n>` while still
 *  running — then the human trigger. Each is dropped when its field is absent, so a running shell with no
 *  duration yields just `elapsed …` + trigger and no dangling separator. The caller joins with " · ". */
export function shellMetaSegments(
  shell: Pick<
    BackgroundShell,
    "status" | "exitCode" | "durationMs" | "startMs" | "trigger"
  >,
  now: number,
): string[] {
  const segs: string[] = [];
  if (shell.exitCode !== undefined) segs.push(`exit ${shell.exitCode}`);
  if (shell.status === "running" && shell.startMs !== undefined)
    segs.push(`elapsed ${formatDuration(now - shell.startMs)}`);
  else if (shell.durationMs !== undefined)
    segs.push(formatDuration(shell.durationMs));
  segs.push(triggerLabel(shell.trigger));
  return segs;
}

/** A human label for dropped leading bytes, or "" when nothing was truncated. */
export function truncLabel(bytes: number): string {
  if (bytes <= 0) return "";
  const kb = Math.round(bytes / 1024);
  return `${kb} KB of earlier output hidden`;
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
