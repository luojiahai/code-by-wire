import { describe, it, expect } from "vitest";
import {
  modeInfo,
  MODE_ORDER,
} from "../../src/renderer/src/workspace/mode-info";

describe("modeInfo", () => {
  it("labels both modes", () => {
    expect(modeInfo().managed.label).toBe("Managed");
    expect(modeInfo().observed.label).toBe("Observed");
  });

  it("carries a non-empty blurb for each mode", () => {
    expect(modeInfo().managed.blurb).toMatch(/driven by Code-by-wire/);
    expect(modeInfo().observed.blurb).toMatch(/read-only/);
  });

  it("keeps each entry self-describing via its kind", () => {
    expect(modeInfo().managed.kind).toBe("managed");
    expect(modeInfo().observed.kind).toBe("observed");
  });
});

describe("MODE_ORDER", () => {
  it("lists managed first so the popover legend reads the same for any session", () => {
    expect(MODE_ORDER).toEqual(["managed", "observed"]);
  });
});
