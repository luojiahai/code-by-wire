import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readModelDefaults } from "../../src/main/settings/model-defaults";
import { tempHomes } from "../helpers/temp-home";

const makeHome = tempHomes("cbw-modeldefaults-");

function writeSettings(settings: unknown): string {
  const claudeDir = join(makeHome(), ".claude");
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, "settings.json"), JSON.stringify(settings));
  return claudeDir;
}

function emptyDir(): string {
  const claudeDir = join(makeHome(), ".claude");
  mkdirSync(claudeDir, { recursive: true });
  return claudeDir;
}

describe("readModelDefaults", () => {
  it("reads a per-family override from settings env", () => {
    const dir = writeSettings({
      env: { ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus-4-7" },
    });
    expect(readModelDefaults(dir, {}).overrides.opus).toBe("claude-opus-4-7");
  });
  it("reads an override from process env when settings is absent", () => {
    const dir = emptyDir();
    expect(
      readModelDefaults(dir, {
        ANTHROPIC_DEFAULT_FABLE_MODEL: "claude-fable-5",
      }).overrides.fable,
    ).toBe("claude-fable-5");
  });
  it("prefers the settings override over process env", () => {
    const dir = writeSettings({
      env: { ANTHROPIC_DEFAULT_OPUS_MODEL: "from-settings" },
    });
    expect(
      readModelDefaults(dir, { ANTHROPIC_DEFAULT_OPUS_MODEL: "from-env" })
        .overrides.opus,
    ).toBe("from-settings");
  });
  it("reads the default model when it is a known family", () => {
    expect(
      readModelDefaults(writeSettings({ model: "opus" }), {}).default,
    ).toBe("opus");
  });
  it("ignores a default that is not one of our families", () => {
    expect(
      readModelDefaults(writeSettings({ model: "claude-opus-4-8" }), {})
        .default,
    ).toBeUndefined();
  });
  it("intersects availableModels with the known families", () => {
    expect(
      readModelDefaults(
        writeSettings({ availableModels: ["opus", "sonnet", "gpt-4"] }),
        {},
      ).allowed,
    ).toEqual(["opus", "sonnet"]);
  });
  it("returns empty overrides for a missing settings file and empty env", () => {
    expect(readModelDefaults(emptyDir(), {})).toEqual({ overrides: {} });
  });
  it("drops a default that is not in the availableModels allowlist", () => {
    const dir = writeSettings({ model: "opus", availableModels: ["sonnet"] });
    const d = readModelDefaults(dir, {});
    expect(d.allowed).toEqual(["sonnet"]);
    expect(d.default).toBeUndefined();
  });
});
