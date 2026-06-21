import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readApiConfig } from "../../src/main/settings/api-config";
import { tempHomes } from "../helpers/temp-home";

const makeHome = tempHomes("cbw-apicfg-");

/** Write a settings.json inside a fresh <home>/.claude and return that claudeDir. */
function writeSettings(settings: unknown): string {
  const claudeDir = join(makeHome(), ".claude");
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, "settings.json"), JSON.stringify(settings));
  return claudeDir;
}

describe("readApiConfig", () => {
  it("parses base URL, auth token, and the x-portkey-provider header", () => {
    const claudeDir = writeSettings({
      env: {
        ANTHROPIC_BASE_URL: "https://api.portkey.ai",
        ANTHROPIC_AUTH_TOKEN: "secret-token-never-shown",
        ANTHROPIC_CUSTOM_HEADERS: "x-portkey-provider: @bedrock-use1-nonprod",
      },
    });
    expect(readApiConfig(claudeDir)).toEqual({
      baseUrl: "https://api.portkey.ai",
      authMethod: "token",
      provider: "bedrock-use1-nonprod",
    });
  });

  it("reports authMethod apiKey when ANTHROPIC_API_KEY is set instead of a token", () => {
    const claudeDir = writeSettings({
      env: {
        ANTHROPIC_BASE_URL: "https://gw.example.com",
        ANTHROPIC_API_KEY: "sk-xxx",
      },
    });
    expect(readApiConfig(claudeDir)).toEqual({
      baseUrl: "https://gw.example.com",
      authMethod: "apiKey",
    });
  });

  it("synthesizes the api.anthropic.com default for a token with no base URL", () => {
    const claudeDir = writeSettings({ env: { ANTHROPIC_AUTH_TOKEN: "tok" } });
    expect(readApiConfig(claudeDir)).toEqual({
      baseUrl: "https://api.anthropic.com",
      authMethod: "token",
    });
  });

  it("synthesizes the api.anthropic.com default for an API key with no base URL", () => {
    const claudeDir = writeSettings({ env: { ANTHROPIC_API_KEY: "sk-xxx" } });
    expect(readApiConfig(claudeDir)).toEqual({
      baseUrl: "https://api.anthropic.com",
      authMethod: "apiKey",
    });
  });

  it("returns null when env has only unrelated keys (no key, token, URL, or cloud flag)", () => {
    const claudeDir = writeSettings({ env: { SOME_OTHER: "x" } });
    expect(readApiConfig(claudeDir)).toBeNull();
  });

  it.each(["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"])(
    "ignores a whitespace-only %s (not a real credential)",
    (key) => {
      const claudeDir = writeSettings({ env: { [key]: "   " } });
      expect(readApiConfig(claudeDir)).toBeNull();
    },
  );

  it.each([
    ["CLAUDE_CODE_USE_BEDROCK", "bedrock"],
    ["CLAUDE_CODE_USE_VERTEX", "vertex"],
    ["CLAUDE_CODE_USE_FOUNDRY", "foundry"],
    ["CLAUDE_CODE_USE_MANTLE", "mantle"],
    ["CLAUDE_CODE_USE_ANTHROPIC_AWS", "anthropic_aws"],
  ])("detects %s as a cloud provider with no host", (flag, provider) => {
    const claudeDir = writeSettings({ env: { [flag]: "1" } });
    expect(readApiConfig(claudeDir)).toEqual({ provider });
  });

  it.each(["true", "yes", "on", "ON", "True"])(
    "treats the flag value %s as enabled",
    (val) => {
      const claudeDir = writeSettings({
        env: { CLAUDE_CODE_USE_BEDROCK: val },
      });
      expect(readApiConfig(claudeDir)).toEqual({ provider: "bedrock" });
    },
  );

  it.each(["0", "false", "no", ""])(
    "treats the flag value %s as disabled",
    (val) => {
      const claudeDir = writeSettings({
        env: { CLAUDE_CODE_USE_BEDROCK: val, ANTHROPIC_API_KEY: "sk-x" },
      });
      // falls through to the key-only direct case
      expect(readApiConfig(claudeDir)).toEqual({
        baseUrl: "https://api.anthropic.com",
        authMethod: "apiKey",
      });
    },
  );

  it("coerces a JSON boolean or number flag the way Claude Code would", () => {
    expect(
      readApiConfig(writeSettings({ env: { CLAUDE_CODE_USE_BEDROCK: true } })),
    ).toEqual({ provider: "bedrock" });
    expect(
      readApiConfig(writeSettings({ env: { CLAUDE_CODE_USE_VERTEX: 1 } })),
    ).toEqual({ provider: "vertex" });
    // A JSON `false`/`0` is disabled and, with nothing else, yields null.
    expect(
      readApiConfig(writeSettings({ env: { CLAUDE_CODE_USE_BEDROCK: false } })),
    ).toBeNull();
    expect(
      readApiConfig(writeSettings({ env: { CLAUDE_CODE_USE_BEDROCK: 0 } })),
    ).toBeNull();
  });

  it("lets a cloud flag win over an also-present base URL", () => {
    const claudeDir = writeSettings({
      env: {
        CLAUDE_CODE_USE_VERTEX: "1",
        ANTHROPIC_BASE_URL: "https://ignored.example.com",
      },
    });
    expect(readApiConfig(claudeDir)).toEqual({ provider: "vertex" });
  });

  it("returns null when settings.json is absent", () => {
    expect(readApiConfig(join(makeHome(), ".claude"))).toBeNull();
  });

  it("returns null when there is no env block", () => {
    expect(
      readApiConfig(writeSettings({ model: "claude-opus-4-8" })),
    ).toBeNull();
  });

  it("returns null on malformed JSON, never throws", () => {
    const claudeDir = join(makeHome(), ".claude");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, "settings.json"), "{ not valid json");
    expect(readApiConfig(claudeDir)).toBeNull();
  });

  it("omits provider when no x-portkey-provider header is present", () => {
    const claudeDir = writeSettings({
      env: {
        ANTHROPIC_BASE_URL: "https://gw.example.com",
        ANTHROPIC_CUSTOM_HEADERS: "x-other: foo",
      },
    });
    expect(readApiConfig(claudeDir)).toEqual({
      baseUrl: "https://gw.example.com",
    });
  });

  it("strips the @ and ignores other headers, never leaking their values", () => {
    const claudeDir = writeSettings({
      env: {
        ANTHROPIC_BASE_URL: "https://gw.example.com",
        ANTHROPIC_CUSTOM_HEADERS:
          "authorization: Bearer super-secret\nx-portkey-provider:  @openai-prod ",
      },
    });
    const config = readApiConfig(claudeDir);
    expect(config).toEqual({
      baseUrl: "https://gw.example.com",
      provider: "openai-prod",
    });
    expect(JSON.stringify(config)).not.toContain("super-secret");
  });
});
