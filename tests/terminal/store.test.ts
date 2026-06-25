import { describe, it, expect, vi } from "vitest";
import { FLOW, type ReattachSnapshot } from "../../src/shared/terminal";
import {
  createTerminalStore,
  type XtermLike,
} from "../../src/renderer/src/terminal/terminal-store";

/** A fake xterm that records writes (with their ack callbacks), user-input wiring, and the custom
 *  key handler the store attaches. */
function fakeXterm() {
  const writes: Array<{ data: string; cb?: () => void }> = [];
  let inputCb: (d: string) => void = () => {};
  let keyHandler: (e: KeyboardEvent) => boolean = () => true;
  const attachKeyHandler = vi.fn((h: (e: KeyboardEvent) => boolean) => {
    keyHandler = h;
  });
  const term: XtermLike = {
    write: (data, cb) => {
      writes.push({ data, cb });
    },
    onData: (cb) => {
      inputCb = cb;
      return { dispose: () => {} };
    },
    attachCustomKeyEventHandler: attachKeyHandler,
    dispose: vi.fn(),
    open: () => {},
    focus: () => {},
    loadAddon: () => {},
    resize: () => {},
    cols: 80,
    rows: 24,
  };
  return {
    term,
    writes,
    attachKeyHandler,
    typeInput: (d: string) => inputCb(d),
    pressKey: (e: KeyboardEvent) => keyHandler(e),
  };
}

function harness(isMac = true) {
  let dataRouter: (id: string, d: string, offset: number) => void = () => {};
  let exitRouter: (id: string, c: number) => void = () => {};
  const api = {
    spawn: vi.fn(),
    adopt: vi.fn(),
    fork: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    ack: vi.fn(),
    kill: vi.fn(),
    pickDirectory: vi.fn(),
    reattach: vi.fn(),
    onData: (cb: (id: string, d: string, offset: number) => void) => {
      dataRouter = cb;
      return () => {};
    },
    onExit: (cb: (id: string, c: number) => void) => {
      exitRouter = cb;
      return () => {};
    },
    onRename: () => () => {}, // the store exposes rename() directly; App drives it, not this channel
  };
  const made: ReturnType<typeof fakeXterm>[] = [];
  const store = createTerminalStore({
    api,
    isMac,
    createTerminal: () => {
      const f = fakeXterm();
      made.push(f);
      return {
        term: f.term,
        fit: { fit: () => {}, proposeDimensions: () => undefined },
        wrapper: {} as HTMLElement,
        rebuildViewport: () => {},
      };
    },
  });
  // Track a per-id cumulative output offset so route() stamps each chunk the way the manager does. Pass an
  // explicit `offset` (the chunk's cumulative END position) when a test needs to line chunks up against a
  // snapshot's coverage; otherwise it auto-advances by the chunk length.
  const outChars = new Map<string, number>();
  return {
    store,
    api,
    made,
    route: (id: string, d: string, offset?: number) => {
      const end = offset ?? (outChars.get(id) ?? 0) + d.length;
      outChars.set(id, end);
      dataRouter(id, d, end);
    },
    exit: (id: string, c: number) => exitRouter(id, c),
  };
}

/** A minimal stand-in for the KeyboardEvent xterm hands the custom key handler. */
function keydown(props: {
  key: string;
  metaKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
}): KeyboardEvent {
  return {
    type: "keydown",
    key: props.key,
    metaKey: props.metaKey ?? false,
    altKey: props.altKey ?? false,
    ctrlKey: props.ctrlKey ?? false,
    shiftKey: props.shiftKey ?? false,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent;
}

describe("createTerminalStore", () => {
  it("creates one terminal per id and returns the same handle on re-acquire (scrollback keep-alive)", () => {
    const h = harness();
    const a1 = h.store.create("a");
    const a2 = h.store.create("a");
    expect(a1).toBe(a2);
    expect(h.made).toHaveLength(1);
  });

  it("routes pushed output to the matching terminal and ignores unknown ids", () => {
    const h = harness();
    h.store.create("a");
    h.route("a", "hello");
    expect(h.made[0].writes[0].data).toBe("hello");
    expect(() => h.route("ghost", "x")).not.toThrow(); // no handle → dropped, no throw
  });

  it("acks a chunk it has to drop, so the pty never leaks flow-control credit", () => {
    const h = harness();
    // No handle for 'ghost'. The manager already counted these chars as unacked when it sent them,
    // so the store credits them straight back instead of stranding them and wedging a paused pty.
    h.route("ghost", "xyz");
    expect(h.api.ack).toHaveBeenCalledWith("ghost", 3);
  });

  it("forwards user keystrokes to the pty for the right id", () => {
    const h = harness();
    h.store.create("a");
    h.made[0].typeInput("ls\r");
    expect(h.api.write).toHaveBeenCalledWith("a", "ls\r");
  });

  it("translates a mac editing combo to readline bytes and writes them to the pty", () => {
    const h = harness();
    h.store.create("a");
    const evt = keydown({ key: "ArrowLeft", metaKey: true }); // cmd+left → line start
    const handled = h.made[0].pressKey(evt);
    expect(handled).toBe(false); // we sent it; xterm must not also emit its own sequence
    // preventDefault is a vi.fn() mock on the event; asserting on the reference is intentional.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(evt.preventDefault).toHaveBeenCalled();
    expect(h.api.write).toHaveBeenCalledWith("a", "\x01"); // Ctrl-A
  });

  it("lets non-editing keys through without sending or preventing default", () => {
    const h = harness();
    h.store.create("a");
    const plain = keydown({ key: "a" }); // plain letter
    const copy = keydown({ key: "c", metaKey: true }); // cmd+C stays copy
    expect(h.made[0].pressKey(plain)).toBe(true);
    expect(h.made[0].pressKey(copy)).toBe(true);
    // preventDefault is a vi.fn() mock on each event; asserting on the references is intentional.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(plain.preventDefault).not.toHaveBeenCalled(); // must not swallow the browser default
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(copy.preventDefault).not.toHaveBeenCalled();
    expect(h.api.write).not.toHaveBeenCalled(); // the key handler sent nothing for either
  });

  it("passes a keyup of an editing combo through (only keydown sends)", () => {
    const h = harness();
    h.store.create("a");
    const up = {
      ...keydown({ key: "ArrowLeft", metaKey: true }),
      type: "keyup",
    } as unknown as KeyboardEvent;
    expect(h.made[0].pressKey(up)).toBe(true);
    expect(h.api.write).not.toHaveBeenCalled();
  });

  it("editing keys follow a /clear rename onto the new id", () => {
    const h = harness();
    h.store.create("a");
    h.store.rename("a", "b");
    h.made[0].pressKey(keydown({ key: "ArrowRight", altKey: true })); // option+right → word forward
    expect(h.api.write).toHaveBeenCalledWith("b", "\x1bf"); // Esc-f, under the rotated id
  });

  it("on non-mac, sends Shift+Enter as a newline but leaves the mac editing combos to xterm", () => {
    const h = harness(false);
    h.store.create("a");
    expect(h.made[0].attachKeyHandler).toHaveBeenCalled(); // handler attaches everywhere now

    // Shift+Enter → newline (Esc+CR), every platform.
    const nl = keydown({ key: "Enter", shiftKey: true });
    expect(h.made[0].pressKey(nl)).toBe(false); // we sent it; xterm must not also emit a CR
    expect(h.api.write).toHaveBeenCalledWith("a", "\x1b\r");

    // A mac-only combo is left untouched off macOS.
    const macCombo = keydown({ key: "ArrowLeft", metaKey: true });
    expect(h.made[0].pressKey(macCombo)).toBe(true);

    h.made[0].typeInput("x"); // ordinary keystrokes still reach the pty via onData
    expect(h.api.write).toHaveBeenCalledWith("a", "x");
  });

  it("translates Shift+Enter to the prompt's newline on macOS too", () => {
    const h = harness();
    h.store.create("a");
    const nl = keydown({ key: "Enter", shiftKey: true });
    expect(h.made[0].pressKey(nl)).toBe(false);
    expect(h.api.write).toHaveBeenCalledWith("a", "\x1b\r");
  });

  it("acks consumed output in 5k chunks once xterm finishes the write", () => {
    const h = harness();
    h.store.create("a");
    h.route("a", "x".repeat(FLOW.ackChars + 10)); // one write of 5010 chars
    expect(h.api.ack).not.toHaveBeenCalled(); // nothing acked until xterm signals the write is done
    h.made[0].writes[0].cb!(); // xterm write-completion callback fires
    expect(h.api.ack).toHaveBeenCalledTimes(1);
    expect(h.api.ack).toHaveBeenCalledWith("a", FLOW.ackChars); // one full chunk; the 10 remainder waits
  });

  it("writes an exit notice on process exit, keeping the buffer", () => {
    const h = harness();
    h.store.create("a");
    h.exit("a", 0);
    expect(h.store.get("a")).toBeDefined(); // handle kept so the scrollback stays readable
    expect(h.made[0].writes.at(-1)?.data).toContain("exited");
  });

  it("rename: migrates a live handle to a new id so output and keystrokes follow, freeing the old id", () => {
    const h = harness();
    h.store.create("a");
    h.store.rename("a", "b");

    h.route("b", "after");
    expect(h.made[0].writes.at(-1)?.data).toBe("after"); // same xterm receives output under the new id

    h.made[0].typeInput("x");
    expect(h.api.write).toHaveBeenCalledWith("b", "x"); // keystrokes now write under the new id

    expect(h.store.get("a")).toBeUndefined(); // old id freed
    expect(h.store.get("b")).toBe(h.store.get("b")); // and the handle lives under the new id
    expect(h.store.get("b")).toBeDefined();
  });

  it("rename: credits in-flight output acked after the rotation instead of leaking the flow-control credit", () => {
    const h = harness();
    h.store.create("a");
    h.route("a", "x".repeat(FLOW.ackChars + 10)); // output arrives under the old id; its ack callback is pending
    const inFlightCb = h.made[0].writes[0].cb!;
    h.store.rename("a", "b"); // a /clear rotates a->b while that write is still mid-parse
    inFlightCb(); // xterm finishes parsing AFTER the rename
    expect(h.api.ack).toHaveBeenCalledWith("b", FLOW.ackChars); // credited under the live id, not dropped
  });

  it("rename: is a no-op for an unknown id", () => {
    const h = harness();
    h.store.create("a");
    expect(() => h.store.rename("ghost", "b")).not.toThrow();
    expect(h.store.get("a")).toBeDefined();
    expect(h.store.get("b")).toBeUndefined();
  });

  it("dispose() tears down the terminal and forgets the id", () => {
    const h = harness();
    h.store.create("a");
    h.store.dispose("a");
    // term.dispose is a vi.fn() mock; asserting on the reference is intentional.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(h.made[0].term.dispose).toHaveBeenCalled();
    expect(h.store.get("a")).toBeUndefined();
  });

  it("drops a late ack callback after the terminal is disposed", () => {
    const h = harness();
    h.store.create("a");
    h.route("a", "x".repeat(FLOW.ackChars + 10));
    const lateCb = h.made[0].writes[0].cb!;
    h.store.dispose("a");
    lateCb(); // xterm write-completion firing after dispose
    expect(h.api.ack).not.toHaveBeenCalled();
    expect(h.store.get("a")).toBeUndefined();
  });

  it("includes a non-zero exit code in the notice", () => {
    const h = harness();
    h.store.create("b");
    h.exit("b", 1);
    expect(h.made[0].writes.at(-1)?.data).toContain("(1)");
  });

  it("does not gate output for a normal create (fresh spawn streams immediately)", () => {
    const h = harness();
    h.store.create("a");
    h.route("a", "hi");
    expect(h.made[0].writes.map((w) => w.data)).toEqual(["hi"]);
    expect(h.made[0].writes[0].cb).toBeTypeOf("function"); // written with an ack callback, as normal
  });

  it("replayOnCreate gates live output: it queues instead of writing, and acks immediately", () => {
    const h = harness();
    h.store.create("a", { replayOnCreate: true });
    h.route("a", "live");
    expect(h.made[0].writes).toHaveLength(0); // queued, not written to xterm yet
    expect(h.api.ack).toHaveBeenCalledWith("a", 4); // acked so flow control never wedges
  });

  it("reattach writes the snapshot, then flushes queued output in order, then opens the gate", async () => {
    const h = harness();
    // offset 0: the snapshot covers no live output, so both queued chunks replay below it.
    h.api.reattach.mockResolvedValue({ data: "SNAP", offset: 0 });
    h.store.create("a", { replayOnCreate: true });
    h.route("a", "L1");
    h.route("a", "L2");

    await h.store.reattach("a", 80, 24);

    expect(h.api.reattach).toHaveBeenCalledWith("a", 80, 24);
    expect(h.made[0].writes.map((w) => w.data)).toEqual(["SNAP", "L1", "L2"]);

    // Gate is open now: further output writes directly, with an ack callback.
    h.route("a", "live");
    expect(h.made[0].writes.at(-1)?.data).toBe("live");
    expect(h.made[0].writes.at(-1)?.cb).toBeTypeOf("function");
  });

  it("reattach drops queued output the snapshot already covers, so it isn't rendered twice", async () => {
    const h = harness();
    // The pty produced 8 chars; the snapshot reflects the first 6. Two chunks land during the reattach:
    // "ABCD" ending at offset 6 (entirely inside the snapshot) and "EF" ending at 8 (after it).
    h.api.reattach.mockResolvedValue({ data: "SNAP", offset: 6 });
    h.store.create("a", { replayOnCreate: true });
    h.route("a", "ABCD", 6); // cumulative end offset = 6 → fully covered by the snapshot
    h.route("a", "EF", 8); // end offset = 8 → produced after the snapshot, must replay

    await h.store.reattach("a", 80, 24);

    // "ABCD" is in the snapshot already, so only "EF" replays — no doubled "ABCD".
    expect(h.made[0].writes.map((w) => w.data)).toEqual(["SNAP", "EF"]);
  });

  it("reattach replays only the uncovered tail of a chunk that straddles the snapshot offset", async () => {
    const h = harness();
    // One coalesced chunk "ABCDEFGH" spans output chars 1..8; the snapshot covers through char 5, so only
    // its tail "FGH" (chars 6..8) is new.
    h.api.reattach.mockResolvedValue({ data: "SNAP", offset: 5 });
    h.store.create("a", { replayOnCreate: true });
    h.route("a", "ABCDEFGH", 8);

    await h.store.reattach("a", 80, 24);

    expect(h.made[0].writes.map((w) => w.data)).toEqual(["SNAP", "FGH"]);
  });

  it("reattach with no live pty (null snapshot) still flushes the queue and opens the gate", async () => {
    const h = harness();
    h.api.reattach.mockResolvedValue(null);
    h.store.create("a", { replayOnCreate: true });
    h.route("a", "queued");

    await h.store.reattach("a", 80, 24);

    expect(h.made[0].writes.map((w) => w.data)).toEqual(["queued"]); // no snapshot, just the queued output
    h.route("a", "after");
    expect(h.made[0].writes.at(-1)?.data).toBe("after"); // gate open
  });

  it("reattach survives a /clear rename during the await (snapshot lands on the rotated handle)", async () => {
    const h = harness();
    let resolveSnap: (s: ReattachSnapshot) => void = () => {};
    h.api.reattach.mockReturnValue(
      new Promise<ReattachSnapshot>((res) => {
        resolveSnap = res;
      }),
    );
    h.store.create("a", { replayOnCreate: true });
    const pending = h.store.reattach("a", 80, 24);
    h.store.rename("a", "b"); // a /clear rotates a->b mid-await
    resolveSnap({ data: "SNAP", offset: 0 });
    await pending;

    expect(h.made[0].writes.map((w) => w.data)).toEqual(["SNAP"]); // same xterm, restored after the rotation
    // Gate dropped on the rotated handle: output under the new id writes directly.
    h.route("b", "x");
    expect(h.made[0].writes.at(-1)?.data).toBe("x");
  });

  it("reattach swallows an api.reattach rejection: opens the gate and flushes the queue without re-throwing", async () => {
    const h = harness();
    h.api.reattach.mockRejectedValue(new Error("ipc failed"));
    h.store.create("a", { replayOnCreate: true });
    h.route("a", "Q1"); // queued while gate is up, acked immediately
    h.route("a", "Q2");

    // The sole caller floats this as `void reattach(...)`, so a re-thrown rejection would surface as an
    // unhandledrejection in the renderer. A transient IPC failure loses the snapshot but must still
    // recover cleanly: open the gate, flush the queued output, and resolve without throwing.
    await expect(h.store.reattach("a", 80, 24)).resolves.toBeUndefined();

    // No snapshot was written (api.reattach rejected before returning one) — only the queued chunks.
    expect(h.made[0].writes.map((w) => w.data)).toEqual(["Q1", "Q2"]);

    // Gate is open: further output now writes directly, with an ack callback.
    h.route("a", "live");
    expect(h.made[0].writes.at(-1)?.data).toBe("live");
    expect(h.made[0].writes.at(-1)?.cb).toBeTypeOf("function");
  });

  it("a second reattach while one is in flight is a no-op: the snapshot is fetched once", async () => {
    const h = harness();
    let resolveSnap: (s: ReattachSnapshot) => void = () => {};
    h.api.reattach.mockReturnValue(
      new Promise<ReattachSnapshot>((res) => {
        resolveSnap = res;
      }),
    );
    h.store.create("a", { replayOnCreate: true });

    // The view re-arms reattach off the handle's live replayPending, so a remount (collapsed tab then
    // switched to it, or StrictMode's double-mount) can call this again while the first fetch is pending.
    const first = h.store.reattach("a", 80, 24);
    const second = h.store.reattach("a", 80, 24);
    expect(h.api.reattach).toHaveBeenCalledTimes(1); // the second bailed — no duplicate snapshot fetch

    resolveSnap({ data: "SNAP", offset: 0 });
    await Promise.all([first, second]);
    expect(h.made[0].writes.map((w) => w.data)).toEqual(["SNAP"]); // written exactly once
  });

  it("queues the exit notice while a reattach is pending so it lands after the snapshot, not before it", async () => {
    const h = harness();
    h.api.reattach.mockResolvedValue({ data: "SNAP", offset: 0 });
    h.store.create("a", { replayOnCreate: true });
    h.route("a", "L1"); // live output, queued behind the gate
    h.exit("a", 0); // the pty exits mid-reattach, before the snapshot lands

    // The gate holds the exit notice too — nothing is written to xterm yet.
    expect(h.made[0].writes).toHaveLength(0);

    await h.store.reattach("a", 80, 24);

    // Restored in stream order: snapshot, then the queued live output, then the exit notice at the end.
    // Without the gate the notice would have landed first and the snapshot would overwrite it.
    const data = h.made[0].writes.map((w) => w.data);
    expect(data[0]).toBe("SNAP");
    expect(data[1]).toBe("L1");
    expect(data[2]).toContain("exited");
    expect(data).toHaveLength(3);
  });
});
