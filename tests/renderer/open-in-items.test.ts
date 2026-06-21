import { describe, expect, it } from "vitest";
import { OPEN_IN_ITEMS } from "../../src/renderer/src/workspace/open-in-items";

describe("OPEN_IN_ITEMS", () => {
  it("lists the two open targets in order", () => {
    expect(OPEN_IN_ITEMS.map((i) => i.key)).toEqual(["vscode", "finder"]);
  });

  it("has valid icons and labels", () => {
    expect(OPEN_IN_ITEMS).toEqual([
      { key: "vscode", label: "VSCode", icon: "code" },
      { key: "finder", label: "Reveal in Finder", icon: "folder-open" },
    ]);
  });
});
