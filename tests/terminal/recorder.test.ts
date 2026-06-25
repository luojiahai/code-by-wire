import { describe, it, expect } from "vitest";
import { createRecorder } from "../../src/main/terminal/recorder";

describe("createRecorder", () => {
  it("serializes written text into a snapshot", async () => {
    const r = createRecorder({ cols: 80, rows: 24 });
    r.write("hello world");
    const snap = await r.snapshot();
    expect(snap.data).toContain("hello world");
    r.dispose();
  });

  it("reports the cumulative count of written chars as the snapshot offset", async () => {
    const r = createRecorder({ cols: 80, rows: 24 });
    r.write("hello"); // 5
    r.write(" world"); // +6 = 11
    const snap = await r.snapshot();
    // The offset is the recorder's position in the output stream — the manager stamps the same scale onto
    // each chunk it sends, so the renderer can drop the queued chars this snapshot already covers.
    expect(snap.offset).toBe(11);
    r.dispose();
  });

  it("includes the alternate-screen buffer and its mode in the snapshot", async () => {
    const r = createRecorder({ cols: 80, rows: 24 });
    // Switch to the alternate screen (?1049h) the way a TUI does, then draw into it.
    r.write("\x1b[?1049hALT-SCREEN-CONTENT");
    const snap = await r.snapshot();
    expect(snap.data).toContain("ALT-SCREEN-CONTENT");
    expect(snap.data).toContain("?1049h"); // the alt-screen enable is preserved (modes not excluded)
    r.dispose();
  });

  it("round-trips: replaying a snapshot into a fresh recorder reproduces the screen", async () => {
    const a = createRecorder({ cols: 80, rows: 24 });
    a.write("line one\r\nline two\r\nprompt> ");
    const snap = await a.snapshot();

    const b = createRecorder({ cols: 80, rows: 24 });
    b.write(snap.data);
    const snapB = await b.snapshot();
    expect(snapB.data).toBe(snap.data); // replaying the snapshot yields the identical serialized state

    a.dispose();
    b.dispose();
  });

  it("drains queued writes before serializing (a large payload's tail is present)", async () => {
    const r = createRecorder({ cols: 80, rows: 24 });
    r.write("START\r\n");
    r.write("x".repeat(20000));
    r.write("\r\nEND-MARKER");
    const snap = await r.snapshot();
    expect(snap.data).toContain("END-MARKER");
    r.dispose();
  });
});
