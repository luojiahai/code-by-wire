import { describe, it, expect, vi } from "vitest";
import type { CliStatus } from "../src/shared/cli-status";

// ipc.ts imports `ipcMain` from electron at module top, which isn't available in the node test env.
// Mock it (as tests/ipc.test.ts does) so the pure `attachCliStatus` helper can be imported.
vi.mock("electron", () => ({ ipcMain: { handle: () => {} } }));

import { attachCliStatus } from "../src/main/ipc";

const ready: CliStatus = {
  kind: "ready",
  version: "2.1.178",
  floor: "2.0.0",
  configDir: { active: "/Users/me/.claude" },
  detail: "ready",
  checkedAt: 1,
};

describe("attachCliStatus", () => {
  it("builds a per-agent record from the controller's cached status", () => {
    const base = { sessions: [], account: null };
    const out = attachCliStatus(base, (agent) =>
      agent === "claude" ? ready : null,
    );
    expect(out.cliStatus.claude).toBe(ready);
    expect(out.cliStatus.codex).toBeNull();
  });
  it("passes null through for every agent before the first check", () => {
    const base = { sessions: [], account: null };
    const out = attachCliStatus(base, () => null);
    expect(out.cliStatus.claude).toBeNull();
    expect(out.cliStatus.codex).toBeNull();
  });
});
