import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(__dirname, "..", "..", "src/renderer/src/shell/ProjectGroupRow.tsx"),
  "utf8",
);

describe("ProjectGroupRow action isolation", () => {
  it("stops quick-add and pin clicks before invoking their actions", () => {
    expect(source).toMatch(
      /onClick=\{\(event\) => \{\s*event\.stopPropagation\(\);\s*onQuickAdd/,
    );
    expect(source).toMatch(
      /onClick=\{\(event\) => \{\s*event\.stopPropagation\(\);\s*onTogglePin\(\);/,
    );
  });
});
