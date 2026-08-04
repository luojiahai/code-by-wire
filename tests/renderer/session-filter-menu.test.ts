import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(__dirname, "..", "..", "src/renderer/src/shell/SessionFilterMenu.tsx"),
  "utf8",
);

describe("SessionFilterMenu control order", () => {
  it("shows the agent-icon preference, then agent selection", () => {
    expect(source).toMatch(/showAgentIcons[\s\S]*name="session-agent"/);
  });

  it("no longer owns visibility — that is the header toggle's job (issue #420)", () => {
    expect(source).not.toContain('name="session-visibility"');
  });
});
