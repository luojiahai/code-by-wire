import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(__dirname, "..", "..", "src/renderer/src/shell/SessionFilterMenu.tsx"),
  "utf8",
);

describe("SessionFilterMenu control order", () => {
  it("shows visibility, agent-icon preference, then agent selection", () => {
    expect(source).toMatch(
      /name="session-visibility"[\s\S]*showAgentIcons[\s\S]*name="session-agent"/,
    );
  });
});
