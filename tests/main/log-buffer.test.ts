import { describe, expect, it, vi } from "vitest";
import { createLogBuffer } from "../../src/main/log-buffer";

describe("createLogBuffer", () => {
  it("caps at 200 entries and evicts oldest first", () => {
    const sink = { error: vi.fn(), warn: vi.fn() };
    let now = 0;
    const log = createLogBuffer({ sink, now: () => now++ });
    for (let i = 0; i < 201; i++) log.warn(`event-${i}`, `message ${i}`);
    const entries = log.recent();
    expect(entries).toHaveLength(200);
    expect(entries[0]).toMatchObject({ ts: 1, event: "event-1" });
    expect(entries.at(-1)).toMatchObject({ ts: 200, event: "event-200" });
  });

  it("retains only safe error metadata while delegating original args", () => {
    const sink = { error: vi.fn(), warn: vi.fn() };
    const log = createLogBuffer({ sink, now: () => 123 });
    const error = Object.assign(new Error("secret transcript fragment"), {
      code: "EACCES",
    });
    log.error("transcript-read-failed", "visible console message", error);
    expect(sink.error).toHaveBeenCalledWith("visible console message", error);
    expect(log.recent()).toEqual([
      {
        ts: 123,
        level: "error",
        event: "transcript-read-failed",
        errorName: "Error",
        errorCode: "EACCES",
      },
    ]);
    expect(JSON.stringify(log.recent())).not.toContain("secret transcript");
    expect(JSON.stringify(log.recent())).not.toContain("visible console");
  });

  it("sanitizes caller-controlled event, error name, and code tokens", () => {
    const sink = { error: vi.fn(), warn: vi.fn() };
    const log = createLogBuffer({ sink });
    const error = Object.assign(new Error("private"), {
      name: "bad\nname",
      code: "bad code with content",
    });
    log.error("bad event", error);
    expect(log.recent()[0]).toMatchObject({
      event: "unknown-event",
      errorName: "Error",
    });
    expect(log.recent()[0].errorCode).toBeUndefined();
  });

  it("returns copies rather than its mutable ring entries", () => {
    const sink = { error: vi.fn(), warn: vi.fn() };
    const log = createLogBuffer({ sink });
    log.warn("one", "message");
    log.recent()[0].event = "changed";
    expect(log.recent()[0].event).toBe("one");
  });
});
