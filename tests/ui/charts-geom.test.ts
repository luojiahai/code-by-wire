import { describe, it, expect } from "vitest";
import {
  donutGradient,
  ringGradient,
  segmentPercents,
  ratePct,
} from "../../src/renderer/src/ui/charts-geom";

describe("segmentPercents", () => {
  it("splits values into their share of the total", () => {
    expect(segmentPercents([1, 1, 2])).toEqual([25, 25, 50]);
  });

  it("returns all zeros when the total is zero (no divide-by-zero)", () => {
    expect(segmentPercents([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("treats a single value as the whole bar", () => {
    expect(segmentPercents([7])).toEqual([100]);
  });

  it("returns [] for an empty input", () => {
    expect(segmentPercents([])).toEqual([]);
  });
});

describe("ringGradient", () => {
  it("fills up to pct, then the track", () => {
    expect(ringGradient(64, "FILL", "TRACK")).toBe(
      "conic-gradient(FILL 0% 64%, TRACK 64% 100%)",
    );
  });

  it("clamps over 100 and under 0", () => {
    expect(ringGradient(150, "F", "T")).toBe(
      "conic-gradient(F 0% 100%, T 100% 100%)",
    );
    expect(ringGradient(-5, "F", "T")).toBe(
      "conic-gradient(F 0% 0%, T 0% 100%)",
    );
  });
});

describe("donutGradient", () => {
  it("lays segments end to end, the last ending exactly at 100%", () => {
    expect(
      donutGradient(
        [
          { value: 1, color: "A" },
          { value: 3, color: "B" },
        ],
        "T",
      ),
    ).toBe("conic-gradient(A 0% 25%, B 25% 100%)");
  });

  it("handles three segments", () => {
    expect(
      donutGradient(
        [
          { value: 1, color: "A" },
          { value: 1, color: "B" },
          { value: 2, color: "C" },
        ],
        "T",
      ),
    ).toBe("conic-gradient(A 0% 25%, B 25% 50%, C 50% 100%)");
  });

  it("rounds intermediate boundaries to two decimals", () => {
    expect(
      donutGradient(
        [
          { value: 1, color: "A" },
          { value: 1, color: "B" },
          { value: 1, color: "C" },
        ],
        "T",
      ),
    ).toBe("conic-gradient(A 0% 33.33%, B 33.33% 66.67%, C 66.67% 100%)");
  });

  it("keeps a trailing zero-value segment zero-width while the last visible arc still reaches 100% (the cache-write=0 cost donut)", () => {
    expect(
      donutGradient(
        [
          { value: 1, color: "A" },
          { value: 1, color: "B" },
          { value: 2, color: "C" },
          { value: 0, color: "D" },
        ],
        "T",
      ),
    ).toBe("conic-gradient(A 0% 25%, B 25% 50%, C 50% 100%, D 100% 100%)");
  });

  it("falls back to a solid track when the total is zero", () => {
    expect(donutGradient([{ value: 0, color: "A" }], "TRACK")).toBe(
      "conic-gradient(TRACK 0% 100%)",
    );
  });

  it("falls back to a solid track for empty segments", () => {
    expect(donutGradient([], "T")).toBe("conic-gradient(T 0% 100%)");
  });
});

describe("ratePct", () => {
  it("is the value as a percentage of the reference max", () => {
    expect(ratePct(88, 640)).toBe(13.75);
    expect(ratePct(640, 640)).toBe(100);
  });

  it("rounds the percentage to two decimals", () => {
    expect(ratePct(1, 3)).toBe(33.33);
  });

  it("clamps over the max and guards a zero max", () => {
    expect(ratePct(700, 640)).toBe(100);
    expect(ratePct(5, 0)).toBe(0);
  });
});
