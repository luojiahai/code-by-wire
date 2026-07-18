import { describe, it, expect } from "vitest";
import { isResumable } from "../src/shared/resumable";

describe("isResumable", () => {
  it("is false for a session with no transcript yet (a fresh spawn/fork draft)", () => {
    // A draft is hydrated with transcriptMtimeMs 0 — Claude hasn't written its transcript, so Resume
    // (`claude --resume <id>`) or Fork (`--fork-session`) would answer "No conversation found with
    // session id".
    expect(isResumable(0)).toBe(false);
  });

  it("is true once the session has written a transcript", () => {
    expect(isResumable(1)).toBe(true);
    expect(isResumable(Date.now())).toBe(true);
  });
});
