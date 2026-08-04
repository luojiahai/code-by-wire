import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(__dirname, "..", "..", "src/renderer/src/shell/LeftSidebar.tsx"),
  "utf8",
);

describe("LeftSidebar folder cap and Older expander (issue #431)", () => {
  it("caps each folder through the shared model helper", () => {
    expect(source).toContain("capSessionForest(");
    expect(source).toContain("SESSIONS_PER_FOLDER");
  });

  it("suspends the cap while a search query is active", () => {
    expect(source).toContain('const capFolders = query.trim() === ""');
  });

  it("reveals the hidden families through a paged Older disclosure", () => {
    expect(source).toContain("olderSessions(");
    expect(source).toContain("showMoreSessions");
    expect(source).toContain("OLDER_PAGE_SIZE");
  });

  it("badges the disclosure with buried sessions, not slots", () => {
    expect(source).toContain("olderSessions(countFamilySessions(hidden))");
  });

  it("ends every Older errand when collapse-all closes the folders", () => {
    expect(source).toContain("setOlderLimits(new Map())");
  });

  it("no longer offers an active-only visibility toggle", () => {
    expect(source).not.toContain("showActiveOnly");
    expect(source).not.toContain("activeOnly");
    expect(source).not.toContain('name="zap"');
  });
});
