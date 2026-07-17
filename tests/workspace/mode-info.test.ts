import { describe, it, expect } from "vitest";
import {
  MODE_INFO,
  MODE_ORDER,
} from "../../src/renderer/src/workspace/mode-info";

describe("MODE_INFO", () => {
  it("labels both modes", () => {
    expect(MODE_INFO.managed.label).toBe("Managed");
    expect(MODE_INFO.observed.label).toBe("Observed");
  });

  it("carries a non-empty blurb for each mode", () => {
    expect(MODE_INFO.managed.blurb).toMatch(/driven by FlightDeck/);
    expect(MODE_INFO.observed.blurb).toMatch(/read-only/);
  });

  it("keeps each entry self-describing via its kind", () => {
    expect(MODE_INFO.managed.kind).toBe("managed");
    expect(MODE_INFO.observed.kind).toBe("observed");
  });
});

describe("MODE_ORDER", () => {
  it("lists managed first so the popover legend reads the same for any session", () => {
    expect(MODE_ORDER).toEqual(["managed", "observed"]);
  });
});
