import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const row = readFileSync(
  join(__dirname, "..", "..", "src/renderer/src/shell/SessionRow.tsx"),
  "utf8",
);
const sidebar = readFileSync(
  join(__dirname, "..", "..", "src/renderer/src/shell/LeftSidebar.tsx"),
  "utf8",
);

describe("nested session rows", () => {
  it("keeps opening the session and expanding its children as separate controls", () => {
    expect(row).toContain("onClick={onSelect}");
    expect(row).toContain("onToggleChildren();");
    expect(row).toContain("event.stopPropagation();");
    expect(row).toContain("aria-expanded={childrenExpanded}");
    expect(row).toContain("collapseSubagents(descendantCount)");
    expect(row).toContain("expandSubagents(descendantCount)");
  });

  it("orders nested controls and keeps disclosure stationary while actions replace the badge", () => {
    const count = row.indexOf("{descendantCount}");
    const disclosure = row.indexOf("aria-expanded={childrenExpanded}");
    const badge = row.indexOf("{threadKindLabel}", disclosure);
    const actions = row.indexOf('aria-haspopup="menu"', badge);

    expect(count).toBeGreaterThan(-1);
    expect(count).toBeLessThan(disclosure);
    expect(disclosure).toBeLessThan(badge);
    expect(badge).toBeLessThan(actions);
    expect(row).toContain(
      '"relative mr-1 flex h-5 shrink-0 items-center justify-end"',
    );
    expect(row).toContain(
      '"pointer-events-none absolute right-0 top-0 grid size-5',
    );
    expect(row).toContain(
      '"opacity-100 group-hover:opacity-0 group-has-[:focus-visible]:opacity-0"',
    );
    expect(row).toContain(
      'className="grid size-5 shrink-0 cursor-pointer place-items-center',
    );
    expect(row).toContain("t.shell.sessionRow.threadKind[session.threadKind]");
  });

  it("renders the forest recursively and leaves expansion to the chevron", () => {
    expect(sidebar).toContain("sessionForest(g.sessions)");
    expect(sidebar).toContain("renderSessionNode(child, depth + 1)");
    expect(sidebar).toContain("isSessionFamilyCollapsed(");
    expect(sidebar).toContain("descendantCount={node.descendantCount}");
    expect(sidebar).toContain(
      "showAgentIcon={depth === 0 && preferences.showAgentIcons}",
    );
    expect(sidebar).not.toContain("forcedExpanded");
    expect(sidebar).not.toContain("hasSelectedDescendant");
  });
});
