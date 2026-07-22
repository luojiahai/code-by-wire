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
    expect(row).toContain("collapseSubagents(childCount)");
    expect(row).toContain("expandSubagents(childCount)");
  });

  it("keeps disclosure stationary while actions replace the agent", () => {
    const count = row.indexOf("{childCount}");
    const disclosure = row.indexOf("aria-expanded={childrenExpanded}");
    const agent = row.indexOf("<AgentIcon", disclosure);
    const actions = row.indexOf('aria-haspopup="menu"', agent);

    expect(count).toBeGreaterThan(-1);
    expect(count).toBeLessThan(disclosure);
    expect(disclosure).toBeLessThan(agent);
    expect(agent).toBeLessThan(actions);
    expect(row).toContain(
      '"pointer-events-none absolute right-1 top-1/2 grid size-5',
    );
    expect(row).toContain(
      'className="absolute right-1 top-1/2 -translate-y-1/2"',
    );
    expect(row).toContain(
      '"opacity-100 group-hover:opacity-0 group-has-[:focus-visible]:opacity-0"',
    );
    expect(row).toContain("const disclosurePosition = showAgentIcon");
    expect(row).toMatch(/\? "right-6"\r?\n {4}: menu\.open/);
    expect(row).toContain(
      '"pointer-events-none grid size-5 cursor-pointer place-items-center',
    );
  });

  it("renders the forest recursively and forces search/selection paths open", () => {
    expect(sidebar).toContain("sessionForest(g.sessions)");
    expect(sidebar).toContain("renderSessionNode(child, depth + 1)");
    expect(sidebar).toContain(
      'const forcedExpanded = query.trim() !== "" || hasSelectedDescendant;',
    );
  });
});
