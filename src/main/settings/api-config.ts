import { join } from "node:path";
import type { ApiConfig } from "@shared/types";
import { readTextOrNull } from "../claude-config";

// ApiConfig lives in @shared/types because deriveAccount (shared) consumes it. Re-exported here so callers
// that read the config keep importing the reader and its type from one place.
export type { ApiConfig };

/** Pull the x-portkey-provider value out of an ANTHROPIC_CUSTOM_HEADERS string. The string is one or more
 *  `Name: value` entries separated by newlines or commas; only that one entry is read, its leading '@' and
 *  surrounding whitespace stripped. Returns undefined when absent or empty. Every other header is ignored,
 *  so nothing else in the string (e.g. an authorization secret) can reach the UI. */
function parseProvider(headers: string): string | undefined {
  for (const entry of headers.split(/[\n,]/)) {
    const colon = entry.indexOf(":");
    if (colon < 0) continue;
    if (entry.slice(0, colon).trim().toLowerCase() !== "x-portkey-provider")
      continue;
    const value = entry
      .slice(colon + 1)
      .trim()
      .replace(/^@/, "")
      .trim();
    return value.length > 0 ? value : undefined;
  }
  return undefined;
}

/** The settings.json env flags that route Claude Code to a cloud provider, each mapped to the provider key
 *  we surface. Checked before ANTHROPIC_BASE_URL because Claude Code's credential precedence puts cloud
 *  routing first: when one is set a stray base URL is ignored. Order is fixed so multiple flags pick a
 *  stable label. */
const CLOUD_PROVIDER_FLAGS: ReadonlyArray<readonly [string, string]> = [
  ["CLAUDE_CODE_USE_BEDROCK", "bedrock"],
  ["CLAUDE_CODE_USE_VERTEX", "vertex"],
  ["CLAUDE_CODE_USE_FOUNDRY", "foundry"],
  ["CLAUDE_CODE_USE_MANTLE", "mantle"],
  ["CLAUDE_CODE_USE_ANTHROPIC_AWS", "anthropic_aws"],
];

/** Claude Code treats 1/true/yes/on (any case) as enabling a flag. A JSON boolean or number is coerced
 *  the same way Claude Code would when it stringifies settings.json env into the process environment. */
function isTruthyFlag(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  const s = typeof v === "number" ? String(v) : v;
  return (
    typeof s === "string" &&
    ["1", "true", "yes", "on"].includes(s.trim().toLowerCase())
  );
}

/** The endpoint Claude Code talks to when only an API key/token is set — the SDK's default. */
const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";

/**
 * The API-billing config from `<claudeDir>/settings.json` env, by precedence:
 *  1. a cloud-provider flag (Bedrock/Vertex/Foundry/Mantle/Anthropic-AWS) — a provider, no endpoint;
 *  2. an explicit ANTHROPIC_BASE_URL — a gateway (auth method + x-portkey-provider parsed as before);
 *  3. a bare ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN — Anthropic-direct, endpoint defaulted to
 *     api.anthropic.com;
 *  4. otherwise null.
 * Best-effort: any absence, read failure, or malformed JSON returns null and never throws. Only key
 * *presence* and these specific keys are read — secret values never reach the renderer.
 */
export function readApiConfig(claudeDir: string): ApiConfig | null {
  try {
    const raw = readTextOrNull(join(claudeDir, "settings.json"));
    if (raw === null) return null;
    const j = JSON.parse(raw) as Record<string, unknown>;
    const env = (j.env ?? {}) as Record<string, unknown>;

    // 1. Cloud routing wins over any base URL. Credentials live outside ANTHROPIC_* env, so there's no
    //    host and no authMethod to surface — just the provider key.
    for (const [flag, provider] of CLOUD_PROVIDER_FLAGS) {
      if (isTruthyFlag(env[flag])) return { provider };
    }

    const baseUrl =
      typeof env.ANTHROPIC_BASE_URL === "string"
        ? env.ANTHROPIC_BASE_URL.trim()
        : "";
    const hasToken =
      typeof env.ANTHROPIC_AUTH_TOKEN === "string" &&
      env.ANTHROPIC_AUTH_TOKEN.trim().length > 0;
    const hasKey =
      typeof env.ANTHROPIC_API_KEY === "string" &&
      env.ANTHROPIC_API_KEY.trim().length > 0;

    // 2. An explicit endpoint is a gateway (or a hand-set direct URL). Parse auth + upstream provider.
    if (baseUrl.length > 0) {
      const config: ApiConfig = { baseUrl };
      if (hasToken) config.authMethod = "token";
      else if (hasKey) config.authMethod = "apiKey";
      if (typeof env.ANTHROPIC_CUSTOM_HEADERS === "string") {
        const provider = parseProvider(env.ANTHROPIC_CUSTOM_HEADERS);
        if (provider) config.provider = provider;
      }
      return config;
    }

    // 3. A key or token with no base URL is Anthropic-direct (the SDK defaults to api.anthropic.com).
    if (hasToken)
      return { baseUrl: DEFAULT_ANTHROPIC_BASE_URL, authMethod: "token" };
    if (hasKey)
      return { baseUrl: DEFAULT_ANTHROPIC_BASE_URL, authMethod: "apiKey" };

    // 4. Nothing identifies an API account.
    return null;
  } catch {
    return null; // unreadable file or malformed JSON — no API identity to surface
  }
}
