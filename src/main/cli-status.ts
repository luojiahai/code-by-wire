import type { BinSource, CliStatus, InstallMethod } from "@shared/cli-status";
import { compareSemver, parseSemver } from "./cli-version";

/** Conservative floor: low enough never to false-flag a working recent install, high enough to
 *  guarantee --session-id / --resume / --model <alias>. A one-line maintainer lever, bumped only when
 *  the app starts relying on a newer CLI behavior. NOT pinned to latest. Verify against the changelog. */
export const MIN_CLAUDE_VERSION = "2.0.0";

/** The raw probe results the pure evaluator classifies. Mirrors shell-path.ts's pure/wiring split. */
export interface CliProbeInput {
  path: string | null;
  source: BinSource | null;
  isRegularFile: boolean;
  duplicates: string[];
  version:
    | { status: "ok"; raw: string }
    | { status: "spawnError" } // ENOENT — binary not actually there
    | { status: "failed" }; // ran but non-zero / timeout / garbage
  auth: { status: "ok" } | { status: "loggedOut" } | { status: "unknown" };
  floor: string;
  installMethod: InstallMethod;
  configDir: { active: string; recovered: string | null };
  now: number;
}

export function evaluateCliStatus(p: CliProbeInput): CliStatus {
  const configDir = {
    active: p.configDir.active,
    recovered: p.configDir.recovered,
    mismatch:
      p.configDir.recovered !== null &&
      p.configDir.recovered !== p.configDir.active,
  };
  const common = {
    path: p.path,
    source: p.source,
    floor: p.floor,
    installMethod: p.installMethod,
    duplicates: p.duplicates,
    configDir,
    checkedAt: p.now,
  };

  if (
    p.path === null ||
    !p.isRegularFile ||
    p.version.status === "spawnError"
  ) {
    return {
      ...common,
      kind: "notFound",
      version: null,
      detail: "not on PATH",
    };
  }
  if (p.version.status === "failed") {
    return {
      ...common,
      kind: "unknown",
      version: null,
      detail: "couldn't run claude",
    };
  }
  const parsed = parseSemver(p.version.raw);
  if (!parsed) {
    return {
      ...common,
      kind: "unknown",
      version: null,
      detail: "unrecognized version",
    };
  }
  const version = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
  if (compareSemver(version, p.floor) < 0) {
    return {
      ...common,
      kind: "outdated",
      version,
      detail: `needs ≥ ${p.floor}`,
    };
  }
  if (p.auth.status === "loggedOut") {
    return { ...common, kind: "loggedOut", version, detail: "logged out" };
  }
  return { ...common, kind: "ready", version, detail: "ready" };
}
