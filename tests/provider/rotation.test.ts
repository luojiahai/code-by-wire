import { describe, it, expect } from "vitest";
import {
  detectRotations,
  applyRotations,
  type ManagedPty,
} from "../../src/main/provider/claude/rotation";

describe("detectRotations", () => {
  it("follows a managed pty whose Claude session id rotated (a /clear) to the new id", () => {
    // The app spawned `claude --session-id A`, so pid 100 is Managed under id A. The user ran /clear,
    // which starts a fresh Claude session under the SAME process: <pid>.json now carries sessionId B.
    const rotations = detectRotations(
      [{ id: "A", pid: 100 }],
      [{ pid: 100, sessionId: "B" }],
    );
    expect(rotations).toEqual([{ from: "A", to: "B", pid: 100 }]);
  });

  it("reports no rotation while the session id still matches its pid", () => {
    expect(
      detectRotations([{ id: "A", pid: 100 }], [{ pid: 100, sessionId: "A" }]),
    ).toEqual([]);
  });

  it("reports no rotation when the pid has no registry entry — a dead/mid-write process is the Ended path, not a rotation", () => {
    expect(detectRotations([{ id: "A", pid: 100 }], [])).toEqual([]);
  });

  it("ignores registry entries for pids it does not manage", () => {
    expect(
      detectRotations([{ id: "A", pid: 100 }], [{ pid: 999, sessionId: "Z" }]),
    ).toEqual([]);
  });

  it("returns only the rotated pty when several are managed", () => {
    const rotations = detectRotations(
      [
        { id: "A", pid: 100 },
        { id: "C", pid: 200 },
      ],
      [
        { pid: 100, sessionId: "B" }, // A rotated to B
        { pid: 200, sessionId: "C" }, // C unchanged
      ],
    );
    expect(rotations).toEqual([{ from: "A", to: "B", pid: 100 }]);
  });
});

describe("applyRotations", () => {
  function fakeManaged(initial: ManagedPty[]) {
    let list = [...initial];
    return {
      entries: () => list,
      rename: (from: string, to: string) => {
        list = list.map((e) => (e.id === from ? { id: to, pid: e.pid } : e));
      },
    };
  }

  it("renames each rotated id in the registry, then hands (from, to) to the rename effect", () => {
    const managed = fakeManaged([{ id: "A", pid: 100 }]);
    const renamed: Array<[string, string]> = [];

    const out = applyRotations(
      managed,
      () => [{ pid: 100, sessionId: "B" }],
      (from, to) => renamed.push([from, to]),
    );

    expect(out).toEqual([{ from: "A", to: "B", pid: 100 }]);
    expect(managed.entries()).toEqual([{ id: "B", pid: 100 }]); // registry follows the pty to its new id
    expect(renamed).toEqual([["A", "B"]]); // and the effect (pty re-key + renderer hand-off) fires
  });

  it("does nothing when no managed pty rotated", () => {
    const managed = fakeManaged([{ id: "A", pid: 100 }]);
    const renamed: Array<[string, string]> = [];
    applyRotations(
      managed,
      () => [{ pid: 100, sessionId: "A" }],
      (from, to) => renamed.push([from, to]),
    );
    expect(managed.entries()).toEqual([{ id: "A", pid: 100 }]);
    expect(renamed).toEqual([]);
  });

  it("skips the registry read entirely when nothing is managed — the common no-terminal case", () => {
    const managed = fakeManaged([]);
    let reads = 0;
    const out = applyRotations(
      managed,
      () => {
        reads++;
        return [];
      },
      () => {},
    );
    expect(reads).toBe(0); // nothing this run controls → nothing can have rotated, so don't read sessions/
    expect(out).toEqual([]);
  });
});
