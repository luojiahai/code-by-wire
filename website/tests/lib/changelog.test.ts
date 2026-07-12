import { describe, expect, it } from "vitest";
import { renderChangelog } from "../../src/lib/changelog";

describe("renderChangelog", () => {
  it("renders a version heading and a categorized entry", () => {
    const markdown =
      "## [0.1.29] - 2026-07-12\n\n### Added\n\n- A thing happened.\n";
    const html = renderChangelog(markdown);
    expect(html).toContain("<h2>[0.1.29] - 2026-07-12</h2>");
    expect(html).toContain("<h3>Added</h3>");
    expect(html).toContain("<li>A thing happened.</li>");
  });
});
