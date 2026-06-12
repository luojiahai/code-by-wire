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

  it("returns null when no base URL is configured, even with other env keys", () => {
    const claudeDir = writeSettings({ env: { ANTHROPIC_AUTH_TOKEN: "tok" } });
    expect(readApiConfig(claudeDir)).toBeNull();
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
