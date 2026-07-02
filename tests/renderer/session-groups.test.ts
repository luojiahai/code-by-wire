import { describe, expect, it } from "vitest";
import type { Session } from "../../src/shared/types";
import {
  groupSessionsByProject,
  UNGROUPED_LABEL,
} from "../../src/renderer/src/shell/session-list-model";

let seq = 0;
function mk(over: Partial<Session>): Session {
  seq += 1;
  return {
    id: `s${seq}`,
    title: `session ${seq}`,
    project: "proj",
    state: "idle",
    createdMs: 1000 + seq,
    lastActivityMs: 1000 + seq,
    ...over,
  } as Session;
}

describe("groupSessionsByProject", () => {
  it("groups by project, most-recently-active group first", () => {
    const a1 = mk({ project: "alpha", lastActivityMs: 100 });
    const b1 = mk({ project: "beta", lastActivityMs: 900 });
    const a2 = mk({ project: "alpha", lastActivityMs: 500 });
    const groups = groupSessionsByProject([a1, b1, a2]);
    expect(groups.map((g) => g.project)).toEqual(["beta", "alpha"]);
    expect(groups[1].sessions).toHaveLength(2);
  });

  it("keeps sortSessions order inside a group (live newest-created first, then ended by activity)", () => {
    const ended = mk({ project: "p", state: "ended", lastActivityMs: 9999 });
    const oldLive = mk({ project: "p", createdMs: 1, lastActivityMs: 1 });
    const newLive = mk({ project: "p", createdMs: 2, lastActivityMs: 2 });
    const [group] = groupSessionsByProject([ended, oldLive, newLive]);
    expect(group.sessions.map((s) => s.id)).toEqual([
      newLive.id,
      oldLive.id,
      ended.id,
    ]);
  });

  it("buckets sessions without a project under the ungrouped label", () => {
    const none = mk({ project: "" });
    const groups = groupSessionsByProject([none]);
    expect(groups).toHaveLength(1);
    expect(groups[0].project).toBe(UNGROUPED_LABEL);
  });

  it("returns an empty array for no sessions", () => {
    expect(groupSessionsByProject([])).toEqual([]);
  });
});
