import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { readTextOrNull, resolveClaudeDir } from "../claude-config";

const execFileP = promisify(execFile);

/** The exact keychain service Claude Code writes. The dump-keychain scan looks for prefixed
 *  variants of it (a work/personal split writes suffixed services). */
const KEYCHAIN_SERVICE = "Claude Code-credentials";
/** dump-keychain output can be large; ccstatusline uses the same 8 MiB cap. */
const DUMP_MAX_BUFFER = 8 * 1024 * 1024;

export interface KeychainCandidate {
  service: string;
  /** Normalized `YYYYMMDDHHMMSSZ` timedate, or null when the block carried none. */
  modifiedAt: string | null;
  /** Position in the dump — the sort tiebreak. */
  order: number;
}

/** A block's `mdat` timedate: the quoted form, else the hex-encoded form security(1) sometimes
 *  emits (decoded ASCII, trailing NULs stripped). Null when neither parses. */
function parseModifiedAt(block: string): string | null {
  const quoted = /"mdat"<timedate>=[^"\n]*"(\d{14}Z?)/.exec(block);
  if (quoted?.[1]) return quoted[1];
  const hex = /"mdat"<timedate>=0x([0-9A-Fa-f]+)/.exec(block);
  if (hex?.[1]) {
    const decoded = Buffer.from(hex[1], "hex")
      .toString("latin1")
      .replace(/\0+$/, "");
    if (/^\d{14}Z?$/.test(decoded)) return decoded;
  }
  return null;
}

/**
 * Candidate services from `security dump-keychain` text: generic-password blocks whose service
 * STARTS WITH the Claude Code service name but isn't exactly it, newest mdat first (dump order
 * breaks ties; null-mdat candidates sort last). Pure — unit-tested without spawning security.
 */
export function parseKeychainCandidates(dump: string): KeychainCandidate[] {
  const found: KeychainCandidate[] = [];
  dump.split(/^keychain: /m).forEach((block, order) => {
    const svce = /"svce"<blob>="([^"]+)"/.exec(block);
    const service = svce?.[1];
    if (
      !service ||
      !service.startsWith(KEYCHAIN_SERVICE) ||
      service === KEYCHAIN_SERVICE
    )
      return;
    found.push({ service, modifiedAt: parseModifiedAt(block), order });
  });
  return found.sort((a, b) => {
    if (a.modifiedAt && b.modifiedAt && a.modifiedAt !== b.modifiedAt)
      return b.modifiedAt.localeCompare(a.modifiedAt);
    if (a.modifiedAt && !b.modifiedAt) return -1;
    if (!a.modifiedAt && b.modifiedAt) return 1;
    return a.order - b.order;
  });
}

/** `{ claudeAiOauth: { accessToken } }` → the token, or null on any malformation. */
function tokenFromJson(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as { claudeAiOauth?: { accessToken?: unknown } };
    const token = j?.claudeAiOauth?.accessToken;
    return typeof token === "string" && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

export interface TokenReaderDeps {
  /** Claude config dir; defaults via resolveClaudeDir. Tests inject a temp dir. */
  claudeDir?: string;
  /** Injected for tests; defaults to process.platform. */
  platform?: NodeJS.Platform;
  /** Runs `security <args>` and resolves stdout, or null on any failure (denied prompt included).
   *  Injected so tests never spawn security. */
  runSecurity?: (args: string[], maxBuffer?: number) => Promise<string | null>;
}

/**
 * Resolve the Claude Code OAuth access token, in ccstatusline's order: exact keychain service →
 * dump-keychain prefixed candidates (mdat-sorted) → `<claudeDir>/.credentials.json`. Every failure
 * degrades to the next source; the final fallback returns null, never throws. Async execFile only —
 * a keychain consent prompt must never block the main thread. The token stays inside this call
 * path: never logged, never over IPC, never persisted.
 */
export function createTokenReader(
  deps: TokenReaderDeps = {},
): () => Promise<string | null> {
  const platform = deps.platform ?? process.platform;
  const claudeDir = resolveClaudeDir(deps.claudeDir);
  const run =
    deps.runSecurity ??
    (async (
      args: string[],
      maxBuffer = 1024 * 1024,
    ): Promise<string | null> => {
      try {
        return (await execFileP("security", args, { maxBuffer })).stdout;
      } catch {
        return null; // denied consent, missing item, or no security(1) — all "no token here"
      }
    });
  const fromService = async (service: string): Promise<string | null> => {
    const out = await run(["find-generic-password", "-s", service, "-w"]);
    return tokenFromJson(out ? out.trim() : null);
  };
  const fromFile = (): string | null => {
    try {
      return tokenFromJson(
        readTextOrNull(join(claudeDir, ".credentials.json")),
      );
    } catch {
      return null; // a non-ENOENT read failure still just means "no token from the file"
    }
  };
  return async (): Promise<string | null> => {
    if (platform === "darwin") {
      const exact = await fromService(KEYCHAIN_SERVICE);
      if (exact) return exact;
      const dump = await run(["dump-keychain"], DUMP_MAX_BUFFER);
      if (dump) {
        for (const candidate of parseKeychainCandidates(dump)) {
          const token = await fromService(candidate.service);
          if (token) return token;
        }
      }
    }
    return fromFile();
  };
}
