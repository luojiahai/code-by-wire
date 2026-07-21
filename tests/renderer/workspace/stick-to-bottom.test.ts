import { describe, expect, it } from "vitest";
import {
  BOTTOM_EPSILON,
  isPinnedToBottom,
} from "../../../src/renderer/src/workspace/stick-to-bottom";

describe("isPinnedToBottom", () => {
  it("is pinned when scrolled exactly to the bottom", () => {
    expect(
      isPinnedToBottom({
        scrollTop: 600,
        clientHeight: 400,
        scrollHeight: 1000,
      }),
    ).toBe(true);
  });

  it("is pinned within the epsilon of slack", () => {
    expect(
      isPinnedToBottom({
        scrollTop: 600 - BOTTOM_EPSILON,
        clientHeight: 400,
        scrollHeight: 1000,
      }),
    ).toBe(true);
  });

  it("is not pinned once scrolled further up than the slack", () => {
    expect(
      isPinnedToBottom({
        scrollTop: 600 - BOTTOM_EPSILON - 1,
        clientHeight: 400,
        scrollHeight: 1000,
      }),
    ).toBe(false);
  });

  it("is not pinned when reading well up the feed", () => {
    expect(
      isPinnedToBottom({ scrollTop: 0, clientHeight: 400, scrollHeight: 1000 }),
    ).toBe(false);
  });

  it("is pinned when the content doesn't overflow", () => {
    expect(
      isPinnedToBottom({ scrollTop: 0, clientHeight: 400, scrollHeight: 300 }),
    ).toBe(true);
  });

  it("honours a custom epsilon", () => {
    const m = { scrollTop: 590, clientHeight: 400, scrollHeight: 1000 };
    expect(isPinnedToBottom(m, 5)).toBe(false);
    expect(isPinnedToBottom(m, 20)).toBe(true);
  });
});
