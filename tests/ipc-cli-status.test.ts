import { describe, it, expect, vi } from "vitest";
import type { CliStatus } from "../src/shared/cli-status";

// ipc.ts imports `ipcMain` from electron at module top, which isn't available in the node test env.
// Mock it (as tests/ipc.test.ts does) so the pure `attachCliStatus` helper can be imported.
vi.mock("electron", () => ({ ipcMain: { handle: () => {} } }));

import { attachCliStatus } from "../src/main/ipc";

const ready: CliStatus = {
  kind: "ready",
  version: "2.1.178",
  path: "/Users/me/.local/bin/claude",
  source: "shell",
  floor: "2.0.0",
  installMethod: "native",
  duplicates: ["/Users/me/.local/bin/claude"],
  configDir: { active: "/Users/me/.claude", recovered: null, mismatch: false },
  detail: "ready",
  checkedAt: 1,
};

describe("attachCliStatus", () => {
  it("adds the controller's cached status to an overview object", () => {
    const base = { sessions: [], account: null };
    expect(attachCliStatus(base, () => ready).cliStatus).toBe(ready);
  });
  it("passes null through before the first check", () => {
    const base = { sessions: [], account: null };
    expect(attachCliStatus(base, () => null).cliStatus).toBeNull();
  });
});
