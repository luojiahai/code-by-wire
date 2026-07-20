import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(__dirname, "..", "..", "src/renderer/src/shell/ProjectGroupRow.tsx"),
  "utf8",
);

describe("ProjectGroupRow action isolation", () => {
  it("stops quick-add and menu actions before invoking their actions", () => {
    expect(source).toMatch(
      /onClick=\{\(event\) => \{\s*event\.stopPropagation\(\);\s*onQuickAdd/,
    );
    expect(source).toMatch(
      /onClick=\{\(event\) => \{\s*event\.stopPropagation\(\);\s*setMenuOpen/,
    );
    expect(source).toMatch(/event\.stopPropagation\(\);\s*onSetPlacement/);
    expect(source).toMatch(
      /event\.stopPropagation\(\);\s*void window\.api\.clipboardWriteText\(cwd\);\s*setMenuOpen\(false\);/,
    );
  });

  it("keeps the path out of the folder row and presents it in the ordered menu", () => {
    expect(source).not.toContain("group.hint");
    expect(source).not.toContain('role="tooltip"');
    expect(source).not.toContain("decoration-dotted");
    expect(source).toContain(
      "title={cwd && quickAddDisabled ? unavailableReason : undefined}",
    );
    expect(source).toContain('aria-haspopup="menu"');
    expect(source).toContain('<Icon name="ellipsis" size={13} />');
    expect(source).toMatch(
      /role="menuitem"[\s\S]*onSetPlacement[\s\S]*role="separator"[\s\S]*\{absolutePathLabel\}[\s\S]*\{cwd\}[\s\S]*clipboardWriteText\(cwd\)[\s\S]*\{copyPathLabel\}/,
    );
  });

  it("reveals quick add and the folder menu together while the menu is open", () => {
    expect(source).toContain("group-hover/project:opacity-100");
    expect(source).toContain("group-focus-within/project:opacity-100");
    expect(source).toContain('menuOpen && "opacity-100"');
  });
});
