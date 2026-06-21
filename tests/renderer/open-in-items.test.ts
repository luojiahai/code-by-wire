import { describe, expect, it } from "vitest";
import { openInItems } from "../../src/renderer/src/workspace/open-in-items";

describe("openInItems", () => {
  it("lists the two open targets in order", () => {
    expect(openInItems("darwin").map((i) => i.key)).toEqual([
      "vscode",
      "finder",
    ]);
  });

  it("labels the file browser for the host OS", () => {
    const label = (platform: string) =>
      openInItems(platform).find((i) => i.key === "finder")?.label;
    expect(label("darwin")).toBe("Open in Finder");
    expect(label("win32")).toBe("Open in File Explorer");
    expect(label("linux")).toBe("Open in File Manager");
  });

  it("has valid curated icons", () => {
    expect(openInItems("darwin")).toEqual([
      { key: "vscode", label: "VSCode", icon: "code" },
      { key: "finder", label: "Open in Finder", icon: "folder-open" },
    ]);
  });
});
