// src/renderer/src/workspace/panels/shell-view.ts
import type { BackgroundShell } from "@shared/types";
import type { AnsiColor } from "./ansi-to-html";

/** The status glyph + cbw tone for a shell row. A completed shell reads green/✓ on a clean exit and
 *  red/✕ on a non-zero code; running pulses teal; killed is a calm grey square. */
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

/** A human label for dropped leading bytes, or "" when nothing was truncated. */
export function truncLabel(bytes: number): string {
  if (bytes <= 0) return "";
  const kb = Math.round(bytes / 1024);
  return `${kb} KB of earlier output hidden`;
}

const BASE_CLASS: Record<AnsiColor, string> = {
  black: "text-fg-faint",
  red: "text-danger",
  green: "text-ok",
  yellow: "text-accent",
  blue: "text-primary",
  magenta: "text-violet",
  cyan: "text-working",
  white: "text-fg",
};

/** A few colors have a brighter cbw token; the rest reuse the base. */
const BRIGHT_CLASS: Partial<Record<AnsiColor, string>> = {
  green: "text-working-bright",
  yellow: "text-accent-bright",
  blue: "text-primary-bright",
};

/** Map a parsed ANSI color to a cbw color class. */
export function ansiClass(fg: AnsiColor, bright = false): string {
  return (bright && BRIGHT_CLASS[fg]) || BASE_CLASS[fg];
}
