import { describe, expect, it } from "vitest";
import {
  OPEN_IN_ITEMS,
  OPEN_IN_GROUP_LABELS,
  OPEN_IN_GROUPS,
} from "../../src/renderer/src/workspace/open-in-items";

describe("OPEN_IN_ITEMS", () => {
  it("lists the four open targets in order", () => {
    expect(OPEN_IN_ITEMS.map((i) => i.key)).toEqual([
      "vscode",
      "finder",
      "repo",
      "pr",
    ]);
  });

  it("puts the two editor/file targets before the two GitHub targets", () => {
    expect(
      OPEN_IN_ITEMS.filter((i) => i.group === "files").map((i) => i.key),
    ).toEqual(["vscode", "finder"]);
    expect(
      OPEN_IN_ITEMS.filter((i) => i.group === "github").map((i) => i.key),
    ).toEqual(["repo", "pr"]);
  });

  it("labels both groups", () => {
    expect(OPEN_IN_GROUP_LABELS.files).toBe("Editor & files");
    expect(OPEN_IN_GROUP_LABELS.github).toBe("GitHub");
  });
});

describe("OPEN_IN_GROUPS", () => {
  it("groups the items in first-appearance order, carrying each group label", () => {
    expect(OPEN_IN_GROUPS.map((g) => g.group)).toEqual(["files", "github"]);
    expect(OPEN_IN_GROUPS.map((g) => g.label)).toEqual([
      "Editor & files",
      "GitHub",
    ]);
  });

  it("keeps every item under its group and loses none", () => {
    expect(OPEN_IN_GROUPS.flatMap((g) => g.items.map((i) => i.key))).toEqual(
      OPEN_IN_ITEMS.map((i) => i.key),
    );
    expect(
      OPEN_IN_GROUPS.every((g) => g.items.every((i) => i.group === g.group)),
    ).toBe(true);
  });
});
