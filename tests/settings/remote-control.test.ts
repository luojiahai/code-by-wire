import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readRemoteControl } from "../../src/main/settings/remote-control";
import { tempHomes } from "../helpers/temp-home";

const makeHome = tempHomes("cbw-remote-");

function writeManifest(claudeDir: string, pid: string, json: unknown): void {
  const d = join(claudeDir, "sessions");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, `${pid}.json`), JSON.stringify(json));
}

describe("readRemoteControl", () => {
  it("returns null when no manifest matches the session", () => {
    expect(readRemoteControl(makeHome(), "sid-x")).toBeNull();
  });

  it("is true when the matching manifest carries a non-empty bridgeSessionId", () => {
    const dir = makeHome();
    writeManifest(dir, "1234", {
      sessionId: "sid-x",
      bridgeSessionId: "bridge-9",
    });
    expect(readRemoteControl(dir, "sid-x")).toBe(true);
  });

  it("is false when the matching manifest has no bridge", () => {
    const dir = makeHome();
    writeManifest(dir, "1234", { sessionId: "sid-x", bridgeSessionId: "" });
    expect(readRemoteControl(dir, "sid-x")).toBe(false);
  });
});
