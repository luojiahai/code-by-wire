/** The five CLI verdicts, in classification precedence (notFound wins, ready loses). */
export type CliStatusKind =
  | "notFound"
  | "unknown"
  | "outdated"
  | "loggedOut"
  | "ready";

/** How the binary was resolved, for the modal's "which claude" line. */
export type BinSource = "override" | "env" | "shell" | "fallback";

/** Best-effort guess of how claude was installed, picks the modal's default tab + upgrade command. */
export type InstallMethod = "native" | "homebrew" | "npm" | "unknown";

export interface CliStatus {
  kind: CliStatusKind;
  /** Parsed version string, or null when not found / unparsable. */
  version: string | null;
  /** Resolved absolute path, for display. */
  path: string | null;
  source: BinSource | null;
  /** The version floor in effect (MIN_CLAUDE_VERSION), shown in the modal. */
  floor: string;
  installMethod: InstallMethod;
  /** Other claude binaries on PATH (length > 1 ⇒ show the "multiple installs" hint). */
  duplicates: string[];
  configDir: { active: string; recovered: string | null; mismatch: boolean };
  /** Human-readable one-liner for the footer/modal (e.g. "needs ≥ 2.0.0"). */
  detail?: string;
  checkedAt: number;
}
