import { join } from "node:path";
import { FAMILIES, type ModelDefaults } from "@shared/models";
import { readTextOrNull } from "../claude-config";

/**
 * Read the model configuration from `<claudeDir>/settings.json` and the provided env map.
 * Collects per-family `ANTHROPIC_DEFAULT_<FAMILY>_MODEL` overrides (settings env takes precedence
 * over process env), the `model` default when it names a known family, and `availableModels`
 * intersected to known families. Best-effort: any absence or read failure returns `{ overrides: {} }`
 * and never throws.
 */
export function readModelDefaults(
  claudeDir: string,
  env: Record<string, string | undefined>,
): ModelDefaults {
  const result: ModelDefaults = { overrides: {} };
  try {
    let settingsEnv: Record<string, unknown> = {};
    let settingsModel: unknown;
    let settingsAvailable: unknown;

    const raw = readTextOrNull(join(claudeDir, "settings.json"));
    if (raw !== null) {
      const j = JSON.parse(raw) as Record<string, unknown>;
      settingsEnv = (j.env ?? {}) as Record<string, unknown>;
      settingsModel = j.model;
      settingsAvailable = j.availableModels;
    }

    // Per-family overrides: settings env wins over process env.
    for (const family of FAMILIES) {
      const key = `ANTHROPIC_DEFAULT_${family.toUpperCase()}_MODEL`;
      const fromSettings =
        typeof settingsEnv[key] === "string" ? settingsEnv[key] : undefined;
      const fromEnv = typeof env[key] === "string" ? env[key] : undefined;
      const value = fromSettings ?? fromEnv;
      if (value) result.overrides[family] = value;
    }

    // Default family: only valid when it is an exact case-sensitive match for a known family.
    if (
      typeof settingsModel === "string" &&
      (FAMILIES as readonly string[]).includes(settingsModel)
    ) {
      result.default = settingsModel as (typeof FAMILIES)[number];
    }

    // Available models: intersect with known families, preserve order.
    if (Array.isArray(settingsAvailable)) {
      const allowed = settingsAvailable.filter(
        (v): v is (typeof FAMILIES)[number] =>
          typeof v === "string" && (FAMILIES as readonly string[]).includes(v),
      );
      if (allowed.length > 0) result.allowed = allowed;
    }

    // If a default was set but isn't in the allowlist, drop it — the wire contract requires
    // that default is always one of the offered families.
    if (
      result.allowed &&
      result.default &&
      !result.allowed.includes(result.default)
    ) {
      delete result.default;
    }
  } catch {
    // Unreadable file or malformed JSON — return whatever we built so far (at minimum { overrides: {} }).
  }
  return result;
}
