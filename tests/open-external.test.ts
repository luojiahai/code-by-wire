import { describe, it, expect } from "vitest";
import { isHttpUrl } from "../src/main/open-external";

describe("isHttpUrl", () => {
  it("accepts http and https", () => {
    expect(isHttpUrl("https://github.com/o/r/pull/166")).toBe(true);
    expect(isHttpUrl("http://localhost:3000")).toBe(true);
  });

  it("rejects other schemes and garbage", () => {
    expect(isHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("not a url")).toBe(false);
    expect(isHttpUrl("")).toBe(false);
  });
});
