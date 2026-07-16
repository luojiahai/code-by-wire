import type { CliStatusKind, InstallMethod } from "@shared/cli-status";
import type { Translations } from "../i18n";

export interface InstallTab {
  method: Exclude<InstallMethod, "unknown">;
  command: string;
}

/** The install commands, current as of the Claude Code docs (setup guide). Locale-invariant —
 *  labels/notes are resolved separately via `installTabLabel`/`installTabNote` at render, never
 *  captured here at module scope. */
export const INSTALL_TABS: InstallTab[] = [
  {
    method: "native",
    command: "curl -fsSL https://claude.ai/install.sh | bash",
  },
  {
    method: "homebrew",
    command: "brew install --cask claude-code",
  },
  {
    method: "npm",
    command: "npm install -g @anthropic-ai/claude-code",
  },
];

/** The tab label. "Homebrew"/"npm" are brand names and stay untranslated (same rule as the product
 *  name); "Native installer" is plain English and gets a real translation. */
export function installTabLabel(
  method: InstallTab["method"],
  t: Translations,
): string {
  switch (method) {
    case "native":
      return t.settings.cli.installNativeLabel;
    case "homebrew":
      return "Homebrew";
    case "npm":
      return "npm";
  }
}

/** The tab's install-path caveat, when it has one (only the native installer does). */
export function installTabNote(
  method: InstallTab["method"],
  t: Translations,
): string | undefined {
  return method === "native" ? t.settings.cli.installNativeNote : undefined;
}

const UPGRADE: Record<InstallMethod, string> = {
  native: "claude update",
  homebrew: "brew upgrade claude-code",
  npm: "npm install -g @anthropic-ai/claude-code@latest",
  unknown: "claude update",
};

export type RemedySection = "install" | "update" | "login" | "verify";

export interface Remedy {
  section: RemedySection;
  /** The single most relevant command, when there is one. */
  command?: string;
  /** For install: which tab to open first. */
  defaultTab?: InstallTab["method"];
}

export function remediesFor(input: {
  kind: CliStatusKind;
  installMethod: InstallMethod;
}): Remedy {
  switch (input.kind) {
    case "notFound":
      return {
        section: "install",
        defaultTab:
          input.installMethod === "unknown" ? "native" : input.installMethod,
      };
    case "outdated":
      return { section: "update", command: UPGRADE[input.installMethod] };
    case "loggedOut":
      return { section: "login" };
    case "unknown":
    case "ready":
    default:
      return { section: "verify", command: "claude --version" };
  }
}
