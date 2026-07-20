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

  it("uses the duplicate-name signal for a name-only canonical-path tooltip", () => {
    expect(source).toContain(
      "const duplicate = group.hint !== undefined && cwd !== undefined;",
    );
    expect(source).toContain(
      "aria-describedby={duplicate ? tooltipId : undefined}",
    );
    expect(source).toContain("decoration-dotted");
    expect(source).toContain('role="tooltip"');
    expect(source).toContain("group-hover/name:block");
    expect(source).toContain("group-focus-visible/project-toggle:block");
    expect(source).toContain("{cwd}");
    expect(source).not.toMatch(/\{group\.hint\}/);
    expect(source).toContain(
      "title={cwd && quickAddDisabled ? unavailableReason : undefined}",
    );
  });
});
