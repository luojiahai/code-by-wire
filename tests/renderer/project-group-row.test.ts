import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runProjectPlacementAction } from "../../src/renderer/src/shell/project-placement-action";

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
      /onClick=\{\(event\) => \{\s*event\.stopPropagation\(\);[\s\S]*?setMenuOpen/,
    );
    expect(source).toMatch(/event\.stopPropagation\(\);\s*void setPlacement\(/);
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
      /role="menuitem"[\s\S]*setPlacement\([\s\S]*role="separator"[\s\S]*\{absolutePathLabel\}[\s\S]*\{cwd\}[\s\S]*clipboardWriteText\(cwd\)[\s\S]*\{copyPathLabel\}/,
    );
  });

  it("reveals quick add and the folder menu together while the menu is open", () => {
    expect(source).toContain("group-hover/project:opacity-100");
    expect(source).toContain("group-focus-within/project:opacity-100");
    expect(source).toContain('menuOpen && "opacity-100"');
  });

  it("portals a fixed right-opening menu and tracks viewport changes", () => {
    expect(source).toContain("createPortal(");
    expect(source).toContain("document.body");
    expect(source).toContain('position: "fixed"');
    expect(source).toContain("placeProjectMenu");
    expect(source).toContain(
      'window.addEventListener("scroll", placeMenu, true)',
    );
    expect(source).toContain('window.addEventListener("resize", placeMenu)');
  });

  it("uses a generic project-actions label for the ellipsis", () => {
    expect(source).toContain("projectActionsLabel");
    expect(source).toContain("aria-label={projectActionsLabel}");
    expect(source).not.toContain("tMenuLabel");
  });

  it("disables placement actions while one is pending", () => {
    expect(source).toContain("placementPending");
    expect(source).toMatch(
      /role="menuitem"[\s\S]*disabled=\{placementPending\}/,
    );
  });
});

describe("runProjectPlacementAction", () => {
  it("closes only after a successful placement settles", async () => {
    const events: string[] = [];
    let resolve!: () => void;
    const pending = new Promise<void>((done) => {
      resolve = done;
    });
    const result = runProjectPlacementAction(
      async () => {
        events.push("started");
        await pending;
        events.push("settled");
      },
      "pinned",
      () => events.push("closed"),
    );
    expect(events).toEqual(["started"]);
    resolve();
    await result;
    expect(events).toEqual(["started", "settled", "closed"]);
  });

  it("keeps the menu open when placement rejects", async () => {
    let closed = false;
    await expect(
      runProjectPlacementAction(
        async () => Promise.reject(new Error("disk full")),
        "hidden",
        () => {
          closed = true;
        },
      ),
    ).rejects.toThrow("disk full");
    expect(closed).toBe(false);
  });
});
