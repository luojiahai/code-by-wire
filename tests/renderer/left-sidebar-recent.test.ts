import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(__dirname, "..", "..", "src/renderer/src/shell/LeftSidebar.tsx"),
  "utf8",
);

describe("LeftSidebar recent-ended expander (issue #420)", () => {
  it("only offers Recent rows while browsing active-only without a query", () => {
    expect(source).toContain(
      'const showRecentRows = activeOnly && query.trim() === ""',
    );
  });

  it("reveals hidden ended sessions through the shared selection helper and pages them", () => {
    expect(source).toContain("recentEndedSessions(");
    expect(source).toContain("recentSessions(recent.total)");
    expect(source).toContain("showMoreSessions");
  });
});
