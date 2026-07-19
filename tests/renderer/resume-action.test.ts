import { describe, expect, it } from "vitest";
import {
  isModelUnknown,
  resumeActionDisabled,
} from "../../src/renderer/src/workspace/resume-action";
import type { Session } from "@shared/types";

describe("resumeActionDisabled", () => {
  it("is enabled when the CLI can spawn and the session is resumable", () => {
    expect(resumeActionDisabled({ canSpawn: true, resumable: true })).toBe(
      false,
    );
  });

  it("disables when the CLI can't spawn", () => {
    expect(resumeActionDisabled({ canSpawn: false, resumable: true })).toBe(
      true,
    );
  });

  it("disables when the session has no saved conversation to resume", () => {
    expect(resumeActionDisabled({ canSpawn: true, resumable: false })).toBe(
      true,
    );
  });

  it("`available` defaults to true — Fork's call site never passes it", () => {
    expect(resumeActionDisabled({ canSpawn: true, resumable: true })).toBe(
      false,
    );
  });

  it("disables when available is explicitly false — Resume's pending-reindex window", () => {
    expect(
      resumeActionDisabled({
        canSpawn: true,
        resumable: true,
        available: false,
      }),
    ).toBe(true);
  });

  it("capable:false disables regardless of everything else (codex Resume/Fork)", () => {
    expect(
      resumeActionDisabled({ canSpawn: true, resumable: true, capable: false }),
    ).toBe(true);
    expect(resumeActionDisabled({ canSpawn: true, resumable: true })).toBe(
      false,
    ); // default true — existing call sites unaffected
  });
});

const s = (o: Partial<Session>): Session => o as Session;

describe("isModelUnknown", () => {
  it("claude with no recorded model → unknown (routes the click through the confirm)", () => {
    expect(isModelUnknown(s({ agent: "claude" }))).toBe(true);
  });
  it("claude with a recorded model → known", () => {
    expect(
      isModelUnknown(s({ agent: "claude", modelRaw: "claude-sonnet-5" })),
    ).toBe(false);
  });
  it("codex (no model picker) → never unknown: its CLI restores its own model, no flag is passed", () => {
    expect(isModelUnknown(s({ agent: "codex" }))).toBe(false);
  });
});
