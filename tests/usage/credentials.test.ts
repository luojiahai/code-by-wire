import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createTokenReader,
  parseKeychainCandidates,
} from "../../src/main/usage/credentials";

const CRED_JSON = JSON.stringify({ claudeAiOauth: { accessToken: "tok-123" } });

function dumpBlock(service: string, mdat: string): string {
  return [
    `keychain: "/Users/x/Library/Keychains/login.keychain-db"`,
    `class: "genp"`,
    `attributes:`,
    `    "mdat"<timedate>=${mdat}`,
    `    "svce"<blob>="${service}"`,
  ].join("\n");
}

describe("parseKeychainCandidates", () => {
  it("prefix filter excludes the exact service name and unrelated services", () => {
    const dump = [
      dumpBlock("Claude Code-credentials", `"20260701120000Z\\000"`),
      dumpBlock("Claude Code-credentials-work", `"20260701120000Z\\000"`),
      dumpBlock("Some Other Service", `"20260701120000Z\\000"`),
    ].join("\n");
    const c = parseKeychainCandidates(dump);
    expect(c.map((x) => x.service)).toEqual(["Claude Code-credentials-work"]);
  });

  it("sorts by mdat desc, dump order as tiebreak, null-mdat last", () => {
    const dump = [
      dumpBlock("Claude Code-credentials-a", `"20260601000000Z\\000"`),
      dumpBlock("Claude Code-credentials-b", `"20260701000000Z\\000"`),
      dumpBlock("Claude Code-credentials-c", `"20260701000000Z\\000"`),
      dumpBlock("Claude Code-credentials-d", `<NULL>`),
    ].join("\n");
    expect(parseKeychainCandidates(dump).map((x) => x.service)).toEqual([
      "Claude Code-credentials-b",
      "Claude Code-credentials-c",
      "Claude Code-credentials-a",
      "Claude Code-credentials-d",
    ]);
  });

  it("decodes the hex-encoded timedate form", () => {
    // "20260701120000Z" hex-encoded, as security(1) emits for some items
    const hex = Buffer.from("20260701120000Z\0", "latin1").toString("hex");
    const dump = dumpBlock("Claude Code-credentials-hex", `0x${hex}`);
    const c = parseKeychainCandidates(dump);
    expect(c[0]?.modifiedAt).toBe("20260701120000Z");
  });
});

describe("createTokenReader", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("keychain exact service wins on darwin", async () => {
    dir = mkdtempSync(join(tmpdir(), "cbw-cred-"));
    const calls: string[][] = [];
    const read = createTokenReader({
      claudeDir: dir,
      platform: "darwin",
      runSecurity: (args) => {
        calls.push(args);
        if (args[0] === "find-generic-password")
          return Promise.resolve(CRED_JSON);
        return Promise.resolve(null);
      },
    });
    expect(await read()).toBe("tok-123");
    expect(calls[0]).toEqual([
      "find-generic-password",
      "-s",
      "Claude Code-credentials",
      "-w",
    ]);
  });

  it("falls through dump-keychain candidates to the credentials file", async () => {
    dir = mkdtempSync(join(tmpdir(), "cbw-cred-"));
    writeFileSync(join(dir, ".credentials.json"), CRED_JSON);
    const read = createTokenReader({
      claudeDir: dir,
      platform: "darwin",
      runSecurity: () => Promise.resolve(null), // every security spawn fails/denied
    });
    expect(await read()).toBe("tok-123");
  });

  it("non-darwin reads only the file; absent/malformed → null", async () => {
    dir = mkdtempSync(join(tmpdir(), "cbw-cred-"));
    const read = createTokenReader({ claudeDir: dir, platform: "linux" });
    expect(await read()).toBeNull(); // absent
    writeFileSync(join(dir, ".credentials.json"), "{not json");
    expect(await read()).toBeNull(); // malformed
  });
});
