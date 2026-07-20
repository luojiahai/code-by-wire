import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(__dirname, "..", "..", "src/renderer/src/shell/LeftSidebar.tsx"),
  "utf8",
);

describe("LeftSidebar filter menu placement", () => {
  it("measures before paint and tracks viewport movement", () => {
    expect(source).toContain("useLayoutEffect");
    expect(source).toContain("placeAnchoredMenu(");
    expect(source).toContain(
      'window.addEventListener("scroll", placeFilterMenu, true)',
    );
    expect(source).toContain(
      'window.addEventListener("resize", placeFilterMenu)',
    );
  });

  it("constrains an oversized menu to a scrollable viewport", () => {
    expect(source).toContain('maxHeight: "calc(100vh - 16px)"');
    expect(source).toContain('overflowY: "auto"');
  });
});
