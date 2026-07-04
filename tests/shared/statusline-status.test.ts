import { describe, it, expect } from "vitest";
import { deriveStatuslineStatus } from "../../src/shared/statusline-status";
import type { StatuslineDeriveInputs } from "../../src/shared/statusline-status";

const NOW = 1_800_000_000_000;

/** Baseline: enabled + installed, interval 10s, one live session reporting 4s ago. */
function inputs(
  over: Partial<StatuslineDeriveInputs> = {},
): StatuslineDeriveInputs {
  return {
    enabled: true,
    installed: true,
    fault: null,
    refreshInterval: 10,
    captures: new Map([["s1", NOW - 4_000]]),
    sessions: [{ id: "s1", state: "idle" }],
    now: NOW,
    ...over,
  };
}

describe("deriveStatuslineStatus — states", () => {
  it("is off when the preference is disabled, regardless of everything else", () => {
    const s = deriveStatuslineStatus(
      inputs({ enabled: false, installed: false }),
    );
    expect(s.state).toBe("off");
    expect(s.fault).toBeUndefined();
  });

  it("is fault with the given message when the installer failed", () => {
    const s = deriveStatuslineStatus(
      inputs({ fault: "settings.json is not valid JSON" }),
    );
    expect(s.state).toBe("fault");
    expect(s.fault).toBe("settings.json is not valid JSON");
  });

  it("is fault when enabled but not installed (externally stripped, heal failed)", () => {
    const s = deriveStatuslineStatus(inputs({ installed: false }));
    expect(s.state).toBe("fault");
    expect(s.fault).toMatch(/not installed/i);
  });

  it("is capturing when a watched session has a fresh capture", () => {
    expect(deriveStatuslineStatus(inputs()).state).toBe("capturing");
  });

  it("is capturing when the watch population is empty (healthy silence)", () => {
    const s = deriveStatuslineStatus(
      inputs({ sessions: [{ id: "s1", state: "ended" }], captures: new Map() }),
    );
    expect(s.state).toBe("capturing");
    expect(s.watchedSessions).toBe(0);
  });

  it("is stale when watched sessions exist and none report", () => {
    const s = deriveStatuslineStatus(inputs({ captures: new Map() }));
    expect(s.state).toBe("stale");
    expect(s.reportingSessions).toBe(0);
    expect(s.watchedSessions).toBe(1);
  });

  it("stays capturing on partial coverage (some but not all reporting)", () => {
    const s = deriveStatuslineStatus(
      inputs({
        sessions: [
          { id: "s1", state: "idle" },
          { id: "s2", state: "working" },
        ],
      }),
    );
    expect(s.state).toBe("capturing");
    expect(s.reportingSessions).toBe(1);
    expect(s.watchedSessions).toBe(2);
  });
});

describe("deriveStatuslineStatus — watch population & freshness", () => {
  it("watches live (non-ended) sessions when refreshInterval is set", () => {
    const s = deriveStatuslineStatus(
      inputs({
        sessions: [
          { id: "s1", state: "idle" },
          { id: "s2", state: "waiting" },
          { id: "s3", state: "ended" },
        ],
      }),
    );
    expect(s.watchKind).toBe("live");
    expect(s.watchedSessions).toBe(2);
  });

  it("narrows to working sessions when refreshInterval is unset (idle silence is healthy)", () => {
    const s = deriveStatuslineStatus(
      inputs({
        refreshInterval: null,
        captures: new Map(),
        sessions: [
          { id: "s1", state: "idle" },
          { id: "s2", state: "working" },
        ],
      }),
    );
    expect(s.watchKind).toBe("working");
    expect(s.watchedSessions).toBe(1);
    expect(s.state).toBe("stale"); // the working session isn't reporting
  });

  it("freshness threshold is 3× the interval, floored at 60s", () => {
    // interval 10s → threshold 60s (floor): a 59s-old capture is fresh, a 61s-old one is not
    expect(
      deriveStatuslineStatus(
        inputs({ captures: new Map([["s1", NOW - 59_000]]) }),
      ).state,
    ).toBe("capturing");
    expect(
      deriveStatuslineStatus(
        inputs({ captures: new Map([["s1", NOW - 61_000]]) }),
      ).state,
    ).toBe("stale");
    // interval 30s → threshold 90s: an 80s-old capture is still fresh
    expect(
      deriveStatuslineStatus(
        inputs({
          refreshInterval: 30,
          captures: new Map([["s1", NOW - 80_000]]),
        }),
      ).state,
    ).toBe("capturing");
  });

  it("uses a flat 60s threshold when the interval is unset", () => {
    const working = [{ id: "s1", state: "working" as const }];
    expect(
      deriveStatuslineStatus(
        inputs({
          refreshInterval: null,
          sessions: working,
          captures: new Map([["s1", NOW - 50_000]]),
        }),
      ).state,
    ).toBe("capturing");
    expect(
      deriveStatuslineStatus(
        inputs({
          refreshInterval: null,
          sessions: working,
          captures: new Map([["s1", NOW - 70_000]]),
        }),
      ).state,
    ).toBe("stale");
  });
});

describe("deriveStatuslineStatus — readouts", () => {
  it("lastCaptureMs is the newest capture across ALL captures, even unwatched ones", () => {
    const s = deriveStatuslineStatus(
      inputs({
        captures: new Map([
          ["s1", NOW - 4_000],
          ["gone-session", NOW - 1_000],
        ]),
      }),
    );
    expect(s.lastCaptureMs).toBe(NOW - 1_000);
  });

  it("lastCaptureMs is null with no captures at all", () => {
    const s = deriveStatuslineStatus(
      inputs({ captures: new Map(), sessions: [] }),
    );
    expect(s.lastCaptureMs).toBeNull();
  });

  it("passes through enabled/installed/refreshInterval verbatim", () => {
    const s = deriveStatuslineStatus(inputs());
    expect(s.enabled).toBe(true);
    expect(s.installed).toBe(true);
    expect(s.refreshInterval).toBe(10);
  });
});
