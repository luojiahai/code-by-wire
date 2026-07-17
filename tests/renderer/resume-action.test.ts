import { describe, expect, it } from "vitest";
import { resumeActionDisabled } from "../../src/renderer/src/workspace/resume-action";

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

  it("disables when available is explicitly false — Adopt's pending-reindex window", () => {
    expect(
      resumeActionDisabled({
        canSpawn: true,
        resumable: true,
        available: false,
      }),
    ).toBe(true);
  });
});
