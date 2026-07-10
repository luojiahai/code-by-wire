import { describe, it, expect } from "vitest";
import {
  thumbMetrics,
  scrollTopForThumbTop,
  MIN_THUMB,
} from "../../src/renderer/src/ui/overlay-scroll-metrics";

describe("thumbMetrics — thumb size and position", () => {
  it("reports no overflow when the content fits the viewport", () => {
    expect(thumbMetrics(0, 200, 200)).toEqual({
      height: 0,
      top: 0,
      overflow: false,
    });
    expect(thumbMetrics(0, 150, 200).overflow).toBe(false);
  });

  it("sizes the thumb as the viewport's share of the content", () => {
    // 200/1000 of a 200px track = 40px thumb.
    const m = thumbMetrics(0, 1000, 200);
    expect(m).toEqual({ height: 40, top: 0, overflow: true });
  });

  it("clamps the thumb to a minimum so it stays grabbable", () => {
    // 200/100000 would be ~0px; floored up to MIN_THUMB.
    expect(thumbMetrics(0, 100000, 200).height).toBe(MIN_THUMB);
  });

  it("parks the thumb at the bottom of the track when scrolled to the end", () => {
    // maxScroll = 800, thumb 40, maxTop = 160.
    const m = thumbMetrics(800, 1000, 200);
    expect(m.top).toBe(160);
    expect(m.top).toBe(200 - m.height);
  });

  it("places the thumb proportionally mid-scroll", () => {
    expect(thumbMetrics(400, 1000, 200).top).toBe(80); // half of maxTop 160
  });
});

describe("scrollTopForThumbTop — inverse mapping for drag", () => {
  it("round-trips with thumbMetrics", () => {
    const { height, top } = thumbMetrics(400, 1000, 200);
    expect(scrollTopForThumbTop(top, height, 1000, 200)).toBe(400);
  });

  it("clamps a thumb dragged past the ends", () => {
    expect(scrollTopForThumbTop(-50, 40, 1000, 200)).toBe(0);
    expect(scrollTopForThumbTop(9999, 40, 1000, 200)).toBe(800); // maxScroll
  });

  it("returns 0 when there's nothing to scroll", () => {
    expect(scrollTopForThumbTop(10, 200, 200, 200)).toBe(0);
  });
});

describe("shortened track (corner reservation for a second bar)", () => {
  it("sizes the thumb from the shortened track", () => {
    // 200px viewport, 190px track (10px corner): thumb = round(190·200/1000) = 38.
    expect(thumbMetrics(0, 1000, 200, 190)).toEqual({
      height: 38,
      top: 0,
      overflow: true,
    });
  });

  it("parks the thumb at the end of the shortened track when fully scrolled", () => {
    const m = thumbMetrics(800, 1000, 200, 190);
    expect(m.top).toBe(190 - m.height);
  });

  it("round-trips drag positions on the shortened track", () => {
    const { height, top } = thumbMetrics(400, 1000, 200, 190);
    expect(scrollTopForThumbTop(top, height, 1000, 200, 190)).toBe(400);
  });

  it("keeps reporting overflow from the viewport, not the track", () => {
    expect(thumbMetrics(0, 200, 200, 190).overflow).toBe(false);
  });

  it("reports no overflow when the track has no room", () => {
    // A container ≤ the other bar's thickness leaves trackLength ≤ 0 — guard, don't NaN.
    expect(thumbMetrics(0, 1000, 200, 0)).toEqual({
      height: 0,
      top: 0,
      overflow: false,
    });
  });
});
