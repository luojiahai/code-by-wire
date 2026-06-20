import { describe, it, expect } from "vitest";
import { normalizeRemoteUrl } from "../../src/main/git/read-git";

describe("normalizeRemoteUrl", () => {
  it("converts scp-style SSH to https and strips .git", () => {
    expect(
      normalizeRemoteUrl("git@github.com:luojiahai/code-by-wire.git"),
    ).toBe("https://github.com/luojiahai/code-by-wire");
  });
  it("converts an ssh:// URL to https", () => {
    expect(
      normalizeRemoteUrl("ssh://git@github.com/luojiahai/code-by-wire.git"),
    ).toBe("https://github.com/luojiahai/code-by-wire");
  });
  it("drops an ssh port and host-agnostically normalizes", () => {
    expect(
      normalizeRemoteUrl("ssh://git@git.example.com:2222/team/app.git"),
    ).toBe("https://git.example.com/team/app");
  });
  it("strips a trailing .git from an https remote", () => {
    expect(
      normalizeRemoteUrl("https://github.com/luojiahai/code-by-wire.git"),
    ).toBe("https://github.com/luojiahai/code-by-wire");
  });
  it("leaves a nested https path without .git unchanged", () => {
    expect(normalizeRemoteUrl("https://gitlab.com/group/sub/repo")).toBe(
      "https://gitlab.com/group/sub/repo",
    );
  });
  it("returns null for null", () => {
    expect(normalizeRemoteUrl(null)).toBeNull();
  });
  it("returns null for an unrecognized remote scheme", () => {
    expect(normalizeRemoteUrl("file:///tmp/repo")).toBeNull();
  });
});
