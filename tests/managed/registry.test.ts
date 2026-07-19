import { describe, it, expect } from "vitest";
import { createManagedRegistry } from "../../src/main/managed-registry";

describe("createManagedRegistry", () => {
  it("reports an id Managed only after it is added", () => {
    const reg = createManagedRegistry();
    expect(reg.has("x")).toBe(false);
    reg.add("x", 100, { agent: "claude", cwd: "/w", spawnedAtMs: 1000 });
    expect(reg.has("x")).toBe(true);
  });

  it("treats add as idempotent", () => {
    const reg = createManagedRegistry();
    reg.add("x", 100, { agent: "claude", cwd: "/w", spawnedAtMs: 1000 });
    reg.add("x", 100, { agent: "claude", cwd: "/w", spawnedAtMs: 1000 });
    expect(reg.has("x")).toBe(true);
  });

  it("keeps ids independent", () => {
    const reg = createManagedRegistry();
    reg.add("a", 100, { agent: "claude", cwd: "/w", spawnedAtMs: 1000 });
    expect(reg.has("a")).toBe(true);
    expect(reg.has("b")).toBe(false);
  });

  it("forgets an id after remove — a Managed session lives only as long as its pty", () => {
    const reg = createManagedRegistry();
    reg.add("x", 100, { agent: "claude", cwd: "/w", spawnedAtMs: 1000 });
    reg.remove("x");
    expect(reg.has("x")).toBe(false);
  });

  it("treats remove of an unknown id as a no-op", () => {
    const reg = createManagedRegistry();
    expect(() => reg.remove("ghost")).not.toThrow();
    expect(reg.has("ghost")).toBe(false);
  });

  it("exposes its managed ptys as id↔pid entries, so rotations can be detected by pid", () => {
    const reg = createManagedRegistry();
    reg.add("a", 100, { agent: "claude", cwd: "/w", spawnedAtMs: 1000 });
    reg.add("b", 200, { agent: "claude", cwd: "/w", spawnedAtMs: 1000 });
    expect(reg.entries()).toEqual([
      { id: "a", pid: 100 },
      { id: "b", pid: 200 },
    ]);
  });

  it("renames a managed id in place, keeping its pid — follows a /clear rotation", () => {
    const reg = createManagedRegistry();
    reg.add("A", 100, { agent: "claude", cwd: "/w", spawnedAtMs: 1000 });
    reg.rename("A", "B");
    expect(reg.has("A")).toBe(false);
    expect(reg.has("B")).toBe(true);
    expect(reg.entries()).toEqual([{ id: "B", pid: 100 }]);
  });

  it("treats rename of an unknown id as a no-op", () => {
    const reg = createManagedRegistry();
    expect(() => reg.rename("ghost", "x")).not.toThrow();
    expect(reg.has("x")).toBe(false);
  });

  it("treats rename onto an already-managed id as a no-op, so it never clobbers another pty", () => {
    const reg = createManagedRegistry();
    reg.add("A", 100, { agent: "claude", cwd: "/w", spawnedAtMs: 1000 });
    reg.add("B", 200, { agent: "claude", cwd: "/w", spawnedAtMs: 1000 });
    reg.rename("A", "B"); // B already maps to a different live pty — don't overwrite it
    expect(reg.entries()).toEqual([
      { id: "A", pid: 100 },
      { id: "B", pid: 200 },
    ]);
  });

  it("remembers the picked model so the provider can front it before the first real turn", () => {
    const reg = createManagedRegistry();
    reg.add("x", 100, {
      model: "sonnet",
      agent: "claude",
      cwd: "/w",
      spawnedAtMs: 1000,
    });
    expect(reg.modelOf("x")).toBe("sonnet");
    expect(reg.modelOf("unknown")).toBeUndefined();
  });

  it("has no picked model for a Resume (added without one — the CLI restores the model)", () => {
    const reg = createManagedRegistry();
    reg.add("x", 100, { agent: "claude", cwd: "/w", spawnedAtMs: 1000 });
    expect(reg.modelOf("x")).toBeUndefined();
  });

  it("forgets the picked model on remove", () => {
    const reg = createManagedRegistry();
    reg.add("x", 100, {
      model: "sonnet",
      agent: "claude",
      cwd: "/w",
      spawnedAtMs: 1000,
    });
    reg.remove("x");
    expect(reg.modelOf("x")).toBeUndefined();
  });

  it("carries the picked model across a /clear rotation", () => {
    const reg = createManagedRegistry();
    reg.add("A", 100, {
      model: "sonnet",
      agent: "claude",
      cwd: "/w",
      spawnedAtMs: 1000,
    });
    reg.rename("A", "B");
    expect(reg.modelOf("A")).toBeUndefined();
    expect(reg.modelOf("B")).toBe("sonnet");
  });

  it("records agent/cwd/spawnedAtMs and filters entriesFor by agent", () => {
    const r = createManagedRegistry();
    r.add("a", 1, { agent: "claude", cwd: "/a", spawnedAtMs: 1 });
    r.add("b", 2, { agent: "codex", cwd: "/b", spawnedAtMs: 2 });
    expect(r.agentOf("b")).toBe("codex");
    expect(r.cwdOf("b")).toBe("/b");
    expect(r.entriesFor("claude")).toEqual([{ id: "a", pid: 1 }]);
    expect(r.codexEntries()).toEqual([{ id: "b", cwd: "/b", spawnedAtMs: 2 }]);
  });

  it("claim marks the rollout taken and survives rename", () => {
    const r = createManagedRegistry();
    r.add("draft", 3, { agent: "codex", cwd: "/b", spawnedAtMs: 5 });
    r.rename("draft", "rollout-id");
    r.claim("rollout-id", "/x/rollout-1.jsonl");
    expect(r.claimedRolloutOf("rollout-id")).toBe("/x/rollout-1.jsonl");
    expect(r.claimedRollouts()).toEqual(new Set(["/x/rollout-1.jsonl"]));
    expect(r.codexEntries()[0].claimedRollout).toBe("/x/rollout-1.jsonl");
  });

  it("add with claimedRollout registers already claim-bound (codex Resume): visible to every claim-matcher input", () => {
    const reg = createManagedRegistry();
    reg.add("u-1", 42, {
      agent: "codex",
      cwd: "/w",
      spawnedAtMs: 5,
      claimedRollout: "/x/r.jsonl",
    });
    expect(reg.claimedRolloutOf("u-1")).toBe("/x/r.jsonl");
    expect(reg.codexEntries()).toEqual([
      { id: "u-1", cwd: "/w", spawnedAtMs: 5, claimedRollout: "/x/r.jsonl" },
    ]);
    expect(reg.claimedRollouts().has("/x/r.jsonl")).toBe(true);
  });
});
