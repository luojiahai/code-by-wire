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

/**
 * The API-billing config from `<claudeDir>/settings.json` env: ANTHROPIC_BASE_URL (required — null when
 * absent), the auth method (ANTHROPIC_AUTH_TOKEN vs ANTHROPIC_API_KEY), and the upstream provider (from
 * ANTHROPIC_CUSTOM_HEADERS). Best-effort: any absence, read failure, or malformed JSON returns null and
 * never throws. Only these keys are ever read — the auth token value and every other header stay unread,
 * so a secret can't reach the renderer.
 */
export function readApiConfig(claudeDir: string): ApiConfig | null {
  try {
    const raw = readTextOrNull(join(claudeDir, "settings.json"));
    if (raw === null) return null;
    const j = JSON.parse(raw) as Record<string, unknown>;
    const env = (j.env ?? {}) as Record<string, unknown>;
    const baseUrl =
      typeof env.ANTHROPIC_BASE_URL === "string"
        ? env.ANTHROPIC_BASE_URL.trim()
        : "";
    if (baseUrl.length === 0) return null;
    const config: ApiConfig = { baseUrl };
    if (
      typeof env.ANTHROPIC_AUTH_TOKEN === "string" &&
      env.ANTHROPIC_AUTH_TOKEN.length > 0
    ) {
      config.authMethod = "token";
    } else if (
      typeof env.ANTHROPIC_API_KEY === "string" &&
      env.ANTHROPIC_API_KEY.length > 0
    ) {
      config.authMethod = "apiKey";
    }
    if (typeof env.ANTHROPIC_CUSTOM_HEADERS === "string") {
      const provider = parseProvider(env.ANTHROPIC_CUSTOM_HEADERS);
      if (provider) config.provider = provider;
    }
    return config;
  } catch {
    return null; // unreadable file or malformed JSON — no API identity to surface
  }
}
