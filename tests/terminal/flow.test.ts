import { describe, it, expect } from "vitest";
import { FLOW } from "../../src/shared/terminal";

describe("FLOW backpressure constants", () => {
  // The resume logic relies on this: the renderer only acks whole ackChars chunks, so the unacked
  // count floors at (total mod ackChars) < ackChars. Resume fires below lowWaterChars, so lowWater must
  // be >= ackChars or a paused pty could wedge forever. terminal.ts also asserts this at import.
  it("keeps lowWaterChars >= ackChars so a paused pty always resumes", () => {
    expect(FLOW.lowWaterChars).toBeGreaterThanOrEqual(FLOW.ackChars);
  });

  it("keeps highWaterChars above lowWaterChars so pause and resume aren’t the same line", () => {
    expect(FLOW.highWaterChars).toBeGreaterThan(FLOW.lowWaterChars);
  });
});
