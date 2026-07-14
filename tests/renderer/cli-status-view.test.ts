import { describe, it, expect } from "vitest";
import { cliStatusView } from "../../src/renderer/src/ui/cli-status-view";
import type { CliStatus } from "../../src/shared/cli-status";

const base: CliStatus = {
  kind: "ready",
  version: "2.1.178",
  floor: "2.0.0",
  detail: "ready",
  configDir: { active: "/Users/me/.claude" },
  checkedAt: 1,
};

describe("cliStatusView", () => {
  it("ready: ok tone, calm headline, no remedy detail", () => {
    expect(cliStatusView(base)).toEqual({
      tone: "ok",
      headline: "Ready",
      detail: "Up to date and ready.",
    });
  });

  it("outdated: warn tone, surfaces the remedy hint as detail", () => {
    expect(
      cliStatusView({
        ...base,
        kind: "outdated",
        version: "1.9.0",
        detail: "needs ≥ 2.0.0",
      }),
    ).toEqual({
      tone: "warn",
      headline: "Update available",
      detail: "needs ≥ 2.0.0",
    });
  });

  it("notFound: error tone", () => {
    expect(
      cliStatusView({
        ...base,
        kind: "notFound",
        version: null,
        detail: "not on PATH",
      }),
    ).toEqual({ tone: "error", headline: "Not found", detail: "not on PATH" });
  });

  it("loggedOut: warn tone, falls back to a generic detail when none given", () => {
    expect(
      cliStatusView({ ...base, kind: "loggedOut", detail: undefined }),
    ).toEqual({
      tone: "warn",
      headline: "Logged out",
      detail: "Action needed.",
    });
  });

  it("unknown: warn tone", () => {
    expect(
      cliStatusView({ ...base, kind: "unknown", detail: "can't determine" }),
    ).toMatchObject({
      tone: "warn",
      headline: "Status unknown",
    });
  });
});
