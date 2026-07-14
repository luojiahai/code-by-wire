import { describe, it, expect } from "vitest";
import {
  classifyVersionError,
  classifyAuthError,
} from "../../src/main/cli-check";

// The check moved from execFileSync to async execFile, where the failure carries its info on the error
// `code` (exit code as a number, or "ENOENT" for a spawn failure, or null on timeout) — a different shape
// than the sync SpawnSyncReturns `.status`. These pure helpers lock that mapping so it can't silently
// regress in the async wiring.

describe("classifyVersionError", () => {
  it("maps ENOENT (spawn failure) to spawnError — the binary isn't really there", () => {
    expect(classifyVersionError("ENOENT")).toEqual({ status: "spawnError" });
  });
  it("maps exit 127 (a POSIX shell's 'command not found') to spawnError — the outer execFile succeeded (the shell itself ran fine), so ENOENT never fires; 127 is how a shell-wrapped probe reports the same 'not really there'", () => {
    expect(classifyVersionError(127)).toEqual({ status: "spawnError" });
  });
  it("maps a non-zero exit code (other than 127) to failed", () => {
    expect(classifyVersionError(1)).toEqual({ status: "failed" });
  });
  it("maps a timeout (null code) to failed", () => {
    expect(classifyVersionError(null)).toEqual({ status: "failed" });
  });
});

describe("classifyAuthError", () => {
  it("maps a clean exit code 1 to loggedOut", () => {
    expect(classifyAuthError(1)).toEqual({ status: "loggedOut" });
  });
  it("never cries wolf: ENOENT, timeout, or any other exit → unknown", () => {
    expect(classifyAuthError("ENOENT")).toEqual({ status: "unknown" });
    expect(classifyAuthError(null)).toEqual({ status: "unknown" });
    expect(classifyAuthError(2)).toEqual({ status: "unknown" });
  });
});
