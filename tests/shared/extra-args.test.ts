import { describe, it, expect } from "vitest";
import {
  validateExtraArgs,
  extraArgsErrorMessage,
  emptyLaunchPresets,
  resolveStoredExtraArgs,
} from "../../src/shared/extra-args";

describe("validateExtraArgs — tokenizer", () => {
  it("empty and whitespace-only input yields no tokens", () => {
    expect(validateExtraArgs("claude", "")).toEqual({ ok: true, tokens: [] });
    expect(validateExtraArgs("claude", "   \t ")).toEqual({
      ok: true,
      tokens: [],
    });
  });
  it("splits on runs of whitespace", () => {
    expect(
      validateExtraArgs("claude", "--verbose  --output-format\tjson"),
    ).toEqual({ ok: true, tokens: ["--verbose", "--output-format", "json"] });
  });
  it("double quotes group a spaced value into one token", () => {
    expect(
      validateExtraArgs("claude", '--settings "/Users/me/My Dir/s.json"'),
    ).toEqual({ ok: true, tokens: ["--settings", "/Users/me/My Dir/s.json"] });
  });
  it("single quotes work too and can embed double quotes", () => {
    expect(
      validateExtraArgs("claude", `--append-system-prompt 'say "hi"'`),
    ).toEqual({ ok: true, tokens: ["--append-system-prompt", 'say "hi"'] });
  });
  it('a quoted span can sit mid-token (--flag="a b")', () => {
    expect(validateExtraArgs("claude", '--settings="a b/s.json"')).toEqual({
      ok: true,
      tokens: ["--settings=a b/s.json"],
    });
  });
  it("backslash is a literal character (Windows paths survive)", () => {
    expect(
      validateExtraArgs("claude", "--settings C:\\Users\\me\\s.json"),
    ).toEqual({ ok: true, tokens: ["--settings", "C:\\Users\\me\\s.json"] });
  });
  it("an empty quoted pair is an empty token", () => {
    expect(validateExtraArgs("claude", '--flag ""')).toEqual({
      ok: true,
      tokens: ["--flag", ""],
    });
  });
  it("an unterminated quote is an error", () => {
    expect(validateExtraArgs("claude", '--settings "oops')).toEqual({
      ok: false,
      kind: "unbalanced-quote",
    });
  });
});

describe("validateExtraArgs — claude denylist", () => {
  for (const flag of [
    "--session-id",
    "--resume",
    "-r",
    "--continue",
    "-c",
    "--fork-session",
  ]) {
    it(`rejects ${flag}`, () => {
      expect(validateExtraArgs("claude", `--verbose ${flag} x`)).toEqual({
        ok: false,
        kind: "reserved",
        token: flag,
      });
    });
  }
  it("rejects the =-joined form", () => {
    expect(validateExtraArgs("claude", "--session-id=abc")).toEqual({
      ok: false,
      kind: "reserved",
      token: "--session-id",
    });
  });
  it("allows --model and --dangerously-skip-permissions", () => {
    expect(
      validateExtraArgs(
        "claude",
        "--model opus --dangerously-skip-permissions",
      ),
    ).toEqual({
      ok: true,
      tokens: ["--model", "opus", "--dangerously-skip-permissions"],
    });
  });
});

describe("validateExtraArgs — codex denylist", () => {
  it("rejects a leading positional token (subcommand)", () => {
    expect(validateExtraArgs("codex", "resume abc")).toEqual({
      ok: false,
      kind: "reserved",
      token: "resume",
    });
  });
  it("allows flag-led args, including flag values", () => {
    expect(validateExtraArgs("codex", "--sandbox read-only -m gpt-5")).toEqual({
      ok: true,
      tokens: ["--sandbox", "read-only", "-m", "gpt-5"],
    });
  });
  it("does not apply the claude denylist to codex", () => {
    expect(validateExtraArgs("codex", "--fork-session")).toEqual({
      ok: true,
      tokens: ["--fork-session"],
    });
  });
});

describe("extraArgsErrorMessage", () => {
  it("names the reserved token", () => {
    expect(
      extraArgsErrorMessage({ kind: "reserved", token: "--resume" }),
    ).toContain("--resume");
  });
  it("describes the unbalanced quote", () => {
    expect(extraArgsErrorMessage({ kind: "unbalanced-quote" })).toMatch(
      /quote/i,
    );
  });
});

describe("emptyLaunchPresets", () => {
  it("returns a fresh object per call with every agent keyed", () => {
    const a = emptyLaunchPresets();
    expect(a).toEqual({ claude: [], codex: [] });
    expect(emptyLaunchPresets()).not.toBe(a);
  });
});

describe("resolveStoredExtraArgs", () => {
  it("resolves a valid stored string to its tokens", () => {
    expect(resolveStoredExtraArgs("claude", "--model opus --verbose")).toEqual([
      "--model",
      "opus",
      "--verbose",
    ]);
  });
  it("resolves an empty stored string to no tokens", () => {
    expect(resolveStoredExtraArgs("claude", "")).toEqual([]);
  });
  it("falls back to no tokens for a stored string with a reserved flag", () => {
    expect(resolveStoredExtraArgs("claude", "--resume abc")).toEqual([]);
  });
  it("falls back to no tokens for a stored string with an unbalanced quote", () => {
    expect(resolveStoredExtraArgs("claude", '--settings "oops')).toEqual([]);
  });
});
