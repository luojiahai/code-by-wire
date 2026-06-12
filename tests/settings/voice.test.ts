import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readVoiceEnabled } from "../../src/main/settings/voice";
import { tempHomes } from "../helpers/temp-home";

const makeHome = tempHomes("cbw-voice-");

function writeSettings(dir: string, file: string, json: unknown): void {
  const d = join(dir, ".claude");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, file), JSON.stringify(json));
}

describe("readVoiceEnabled", () => {
  it("returns null when no settings define voice", () => {
    expect(
      readVoiceEnabled(makeHome(), join(makeHome(), ".claude")),
    ).toBeNull();
  });

  it("reads voice.enabled from the project-local settings", () => {
    const cwd = makeHome();
    writeSettings(cwd, "settings.json", { voice: { enabled: true } });
    expect(readVoiceEnabled(cwd, join(makeHome(), ".claude"))).toBe(true);
  });

  it("prefers settings.local.json over settings.json in the same dir", () => {
    const cwd = makeHome();
    writeSettings(cwd, "settings.json", { voice: { enabled: true } });
    writeSettings(cwd, "settings.local.json", { voice: { enabled: false } });
    expect(readVoiceEnabled(cwd, join(makeHome(), ".claude"))).toBe(false);
  });

  it("falls back to the user-global settings when the project is silent", () => {
    const cwd = makeHome();
    const userDir = makeHome();
    writeFileSync(
      join(userDir, "settings.json"),
      JSON.stringify({ voice: { enabled: true } }),
    );
    expect(readVoiceEnabled(cwd, userDir)).toBe(true);
  });
});
