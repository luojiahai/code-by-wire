import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLaunchPresetStore } from "../src/main/launch-presets";
import { emptyLaunchPresets } from "../src/shared/extra-args";

describe("createLaunchPresetStore", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  function tmp(): string {
    const d = mkdtempSync(join(tmpdir(), "cbw-launch-presets-"));
    dirs.push(d);
    return d;
  }

  it("reads empty per-agent lists when the file is absent", () => {
    expect(createLaunchPresetStore({ dir: tmp() }).read()).toEqual(
      emptyLaunchPresets(),
    );
  });
  it("round-trips a full presets object across instances", () => {
    const dir = tmp();
    const p = {
      ...emptyLaunchPresets(),
      claude: [{ name: "YOLO", args: "--dangerously-skip-permissions" }],
    };
    createLaunchPresetStore({ dir }).write(p);
    expect(createLaunchPresetStore({ dir }).read()).toEqual(p);
  });
  it("drops malformed entries and unknown agents from a hand-edited file", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "launch-presets.json"),
      JSON.stringify({
        claude: [
          { name: "ok", args: "--x" },
          { name: 5, args: "--y" },
          { name: "no-args" },
          "junk",
        ],
        gemini: [{ name: "n", args: "-a" }],
      }),
    );
    expect(createLaunchPresetStore({ dir }).read()).toEqual({
      ...emptyLaunchPresets(),
      claude: [{ name: "ok", args: "--x" }],
    });
  });
  it("tolerates a corrupt file by reading empty", () => {
    const dir = tmp();
    writeFileSync(join(dir, "launch-presets.json"), "{ not json");
    expect(createLaunchPresetStore({ dir }).read()).toEqual(
      emptyLaunchPresets(),
    );
  });
});
