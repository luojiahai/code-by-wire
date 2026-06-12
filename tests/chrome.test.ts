import { describe, it, expect } from "vitest";
import {
  headerLeftPaddingPx,
  MAC_TRAFFIC_LIGHT_INSET_PX,
  HEADER_EDGE_PADDING_PX,
} from "../src/shared/chrome";

describe("headerLeftPaddingPx", () => {
  it("clears the traffic lights only on macOS when windowed", () => {
    expect(headerLeftPaddingPx(true, false)).toBe(MAC_TRAFFIC_LIGHT_INSET_PX); // 96
  });

  it("drops to the edge padding on macOS in fullscreen", () => {
    expect(headerLeftPaddingPx(true, true)).toBe(HEADER_EDGE_PADDING_PX); // 16
  });

  it("uses the edge padding off macOS regardless of fullscreen", () => {
    expect(headerLeftPaddingPx(false, false)).toBe(HEADER_EDGE_PADDING_PX);
    expect(headerLeftPaddingPx(false, true)).toBe(HEADER_EDGE_PADDING_PX);
  });
});
