import { describe, it, expect } from "vitest";
import {
  initialUpdateState,
  isUpdatePending,
  nextUpdateState,
  releaseNotesUrl,
  type UpdateState,
} from "../src/shared/update";

describe("initialUpdateState", () => {
  it("is idle when packaged", () => {
    expect(initialUpdateState("0.1.16", true)).toEqual({
      currentVersion: "0.1.16",
      phase: { kind: "idle" },
    });
  });
  it("is unsupported when not packaged (dev)", () => {
    expect(initialUpdateState("0.1.16", false)).toEqual({
      currentVersion: "0.1.16",
      phase: { kind: "unsupported" },
    });
  });
});

describe("releaseNotesUrl", () => {
  it("builds the GitHub tag URL", () => {
    expect(releaseNotesUrl("0.1.17")).toBe(
      "https://github.com/luojiahai/code-by-wire/releases/tag/v0.1.17",
    );
  });
});

describe("nextUpdateState", () => {
  const idle: UpdateState = {
    currentVersion: "0.1.16",
    phase: { kind: "idle" },
  };

  it("checking -> checking, carrying currentVersion", () => {
    expect(nextUpdateState(idle, { type: "checking" })).toEqual({
      currentVersion: "0.1.16",
      phase: { kind: "checking" },
    });
  });

  it("available -> available with a built notes URL", () => {
    expect(
      nextUpdateState(idle, {
        type: "available",
        version: "0.1.17",
        releaseDate: "2026-06-24",
      }),
    ).toEqual({
      currentVersion: "0.1.16",
      phase: {
        kind: "available",
        version: "0.1.17",
        releaseDate: "2026-06-24",
        notesUrl:
          "https://github.com/luojiahai/code-by-wire/releases/tag/v0.1.17",
      },
    });
  });

  it("not-available -> upToDate with the stamped time", () => {
    expect(nextUpdateState(idle, { type: "not-available", at: 1234 })).toEqual({
      currentVersion: "0.1.16",
      phase: { kind: "upToDate", checkedAt: 1234 },
    });
  });

  it("progress carries the in-flight version and clamps percent", () => {
    const available = nextUpdateState(idle, {
      type: "available",
      version: "0.1.17",
    });
    expect(
      nextUpdateState(available, {
        type: "progress",
        percent: 147,
        transferred: 60,
        total: 60,
      }),
    ).toEqual({
      currentVersion: "0.1.16",
      phase: {
        kind: "downloading",
        version: "0.1.17",
        percent: 100,
        transferred: 60,
        total: 60,
      },
    });
  });

  it("downloaded -> downloaded", () => {
    expect(
      nextUpdateState(idle, { type: "downloaded", version: "0.1.17" }),
    ).toEqual({
      currentVersion: "0.1.16",
      phase: { kind: "downloaded", version: "0.1.17" },
    });
  });

  it("error -> error", () => {
    expect(
      nextUpdateState(idle, { type: "error", message: "offline" }),
    ).toEqual({
      currentVersion: "0.1.16",
      phase: { kind: "error", message: "offline" },
    });
  });

  it("unsupported is sticky (dev never starts checking)", () => {
    const dev = initialUpdateState("0.1.16", false);
    expect(nextUpdateState(dev, { type: "checking" })).toBe(dev);
  });

  it("a stray checking during a download keeps the progress", () => {
    const downloading: UpdateState = {
      currentVersion: "0.1.16",
      phase: {
        kind: "downloading",
        version: "0.1.17",
        percent: 40,
        transferred: 24,
        total: 60,
      },
    };
    expect(nextUpdateState(downloading, { type: "checking" })).toBe(
      downloading,
    );
  });
});

describe("isUpdatePending", () => {
  it("is true for available, downloading, and downloaded", () => {
    expect(
      isUpdatePending({
        kind: "available",
        version: "0.1.17",
        notesUrl:
          "https://github.com/luojiahai/code-by-wire/releases/tag/v0.1.17",
      }),
    ).toBe(true);
    expect(
      isUpdatePending({
        kind: "downloading",
        version: "0.1.17",
        percent: 40,
        transferred: 24,
        total: 60,
      }),
    ).toBe(true);
    expect(isUpdatePending({ kind: "downloaded", version: "0.1.17" })).toBe(
      true,
    );
  });

  it("is false for every non-pending phase", () => {
    expect(isUpdatePending({ kind: "unsupported" })).toBe(false);
    expect(isUpdatePending({ kind: "idle" })).toBe(false);
    expect(isUpdatePending({ kind: "checking" })).toBe(false);
    expect(isUpdatePending({ kind: "upToDate", checkedAt: 1234 })).toBe(false);
    expect(isUpdatePending({ kind: "error", message: "offline" })).toBe(false);
  });
});
