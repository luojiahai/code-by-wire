/** The five CLI verdicts, in classification precedence (notFound wins, ready loses). */
export type CliStatusKind =
  | "notFound"
  | "unknown"
  | "outdated"
  | "loggedOut"
  | "ready";

/** Best-effort guess of how claude was installed. Since the app no longer resolves an absolute binary
 *  path, this is always "unknown" in practice — kept only because cli-remedies.ts's `remediesFor` and
 *  `INSTALL_TABS` are keyed by it, and a dedicated type documents that contract better than a bare
 *  string literal would. */
export type InstallMethod = "native" | "homebrew" | "npm" | "unknown";

export interface CliStatus {
  kind: CliStatusKind;
  /** Parsed version string, or null when not found / unparsable. */
  version: string | null;
  /** The version floor in effect (MIN_CLAUDE_VERSION), shown in the modal. */
  floor: string;
  /** Where this app reads Claude Code transcripts/settings from — display only. */
  configDir: { active: string };
  /** Human-readable one-liner for the footer/modal (e.g. "needs ≥ 2.0.0"). */
  detail?: string;
  checkedAt: number;
}
