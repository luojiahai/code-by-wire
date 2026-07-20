import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(__dirname, "..", "..", "src/renderer/src/shell/LeftSidebar.tsx"),
  "utf8",
);

describe("LeftSidebar Hidden disclosure", () => {
  it("is a compact non-sticky companion row with a hairline and adjacent count", () => {
    const hidden = source.slice(source.indexOf("{hiddenCount > 0"));
    expect(hidden).toMatch(
      /hiddenLabel[\s\S]*hiddenCount[\s\S]*name=\{hiddenCollapsed \? "chevron-right" : "chevron-down"\}/,
    );
    expect(hidden).toContain("border-t border-sidebar-border");
    expect(hidden).toContain("uppercase");
    expect(hidden).not.toContain("sticky");
    expect(hidden).not.toContain("<SidebarPanelLabel");
    expect(hidden).toMatch(/hiddenLabel[\s\S]*hiddenCount/);
  });
});
