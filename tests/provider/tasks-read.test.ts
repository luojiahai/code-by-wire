import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClaudeProvider } from "../../src/main/provider/claude";
import { tempHomes } from "../helpers/temp-home";

const makeHome = tempHomes("cbw-tr-");

function writeTask(
  home: string,
  sessionId: string,
  file: string,
  body: object,
): void {
  const dir = join(home, "tasks", sessionId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), JSON.stringify(body));
}

describe("provider.readTasks", () => {
  it("returns changed tasks, then unchanged for the echoed token", () => {
    const home = makeHome();
    writeTask(home, "sid", "1.json", {
      id: "1",
      subject: "A",
      status: "pending",
      blocks: [],
      blockedBy: [],
    });
    const provider = createClaudeProvider({ claudeDir: home });

    const r = provider.readTasks("sid");
    expect(r.status).toBe("changed");
    if (r.status !== "changed") return;
    expect(r.tasks).toEqual([{ id: "1", subject: "A", status: "pending" }]);
    expect(provider.readTasks("sid", r.mtimeMs).status).toBe("unchanged");
  });

  it("is absent for a session with no tasks dir", () => {
    expect(
      createClaudeProvider({ claudeDir: makeHome() }).readTasks("nope").status,
    ).toBe("absent");
  });
});
