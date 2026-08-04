import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  projectPlacementMatches,
  runProjectPlacementAction,
} from "../../src/renderer/src/shell/project-placement-action";

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

  it("keeps quick add and the folder menu visible without hovering the row", () => {
    expect(source).not.toContain("opacity-0");
    expect(source).not.toContain("group-hover/project:opacity-100");
    expect(source).not.toContain("group-focus-within/project:opacity-100");
    expect(source).not.toContain('menuOpen && "opacity-100"');
  });

  it("badges the chevron with the live-session count only when there is one", () => {
    expect(source).toMatch(
      /activeCount > 0 && \(\s*<span[\s\S]*?\{activeSessionsBadge\}[\s\S]*?<\/span>\s*\)/,
    );
    // Spelled out ("3 live"), never a bare digit that could read as any other total. The words
    // are the accessible name too, so the pill needs no role/aria-label of its own.
    expect(source).not.toContain("{activeCount}<");
    expect(source).not.toContain("aria-label={activeSessionsLabel}");
    expect(source).toContain("title={activeSessionsLabel}");
    // Sits after the chevron so a changing count never shifts the disclosure target.
    expect(source).toMatch(/name="chevron-right"[\s\S]*?activeCount > 0/);
    // Inside the toggle button, so it isn't gated on the cwd-only action cluster.
    expect(source).toMatch(
      /activeCount > 0[\s\S]*?<\/button>[\s\S]*?\{cwd && \(/,
    );
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

describe("projectPlacementMatches", () => {
  it.each([
    ["pinned", { pinnedAtMs: 1 }, true],
    ["pinned", { pinnedAtMs: 1, hiddenAtMs: 2 }, false],
    ["pinned", { hiddenAtMs: 2 }, false],
    ["pinned", undefined, false],
    ["hidden", { hiddenAtMs: 2 }, true],
    ["hidden", { pinnedAtMs: 1, hiddenAtMs: 2 }, false],
    ["hidden", { pinnedAtMs: 1 }, false],
    ["hidden", undefined, false],
    ["ordinary", undefined, true],
    ["ordinary", {}, true],
    ["ordinary", { pinnedAtMs: 1 }, false],
    ["ordinary", { hiddenAtMs: 2 }, false],
  ] as const)("matches %s against %j as %s", (placement, entry, expected) => {
    expect(
      projectPlacementMatches(
        entry ? { "/repo": entry } : {},
        "/repo",
        placement,
      ),
    ).toBe(expected);
  });

  it("detects an unchanged overview after a failed persistence attempt", () => {
    expect(
      projectPlacementMatches(
        { "/repo": { hiddenAtMs: 10 } },
        "/repo",
        "pinned",
      ),
    ).toBe(false);
  });
});
