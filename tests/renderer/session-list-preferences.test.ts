import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SESSIONS_LIST_PREFERENCES,
  loadSessionsListPreferences,
  saveSessionsListPreferences,
} from "../../src/renderer/src/shell/session-list-preferences";

const KEY = "cbw.sessionsList.v2";

describe("sessions list preferences", () => {
  beforeEach(() => localStorage.clear());

  it("loads defaults when no preferences exist", () => {
    expect(loadSessionsListPreferences(localStorage)).toEqual(
      DEFAULT_SESSIONS_LIST_PREFERENCES,
    );
  });

  it("loads valid persisted preferences", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        visibility: "active",
        showAgentIcons: false,
        agent: "codex",
      }),
    );

    expect(loadSessionsListPreferences(localStorage)).toEqual({
      visibility: "active",
      showAgentIcons: false,
      agent: "codex",
    });
  });

  it("falls back field-by-field for invalid persisted values", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        visibility: "hidden",
        showAgentIcons: false,
        agent: "other",
      }),
    );

    expect(loadSessionsListPreferences(localStorage)).toEqual({
      visibility: "all",
      showAgentIcons: false,
      agent: "all",
    });
  });

  it("returns defaults for malformed or non-object JSON", () => {
    localStorage.setItem(KEY, "not json");
    expect(loadSessionsListPreferences(localStorage)).toEqual(
      DEFAULT_SESSIONS_LIST_PREFERENCES,
    );

    localStorage.setItem(KEY, "null");
    expect(loadSessionsListPreferences(localStorage)).toEqual(
      DEFAULT_SESSIONS_LIST_PREFERENCES,
    );
  });

  it("migrates the legacy active-only preference when v2 is absent", () => {
    localStorage.setItem("cbw.sessionsActiveOnly.v1", "true");

    expect(loadSessionsListPreferences(localStorage)).toEqual({
      visibility: "active",
      showAgentIcons: true,
      agent: "all",
    });
  });

  it("does not migrate the legacy preference when v2 exists", () => {
    localStorage.setItem("cbw.sessionsActiveOnly.v1", "true");
    localStorage.setItem(KEY, JSON.stringify({ showAgentIcons: false }));

    expect(loadSessionsListPreferences(localStorage)).toEqual({
      visibility: "all",
      showAgentIcons: false,
      agent: "all",
    });
  });

  it("saves the complete value and ignores storage failures", () => {
    const value = {
      visibility: "active",
      showAgentIcons: false,
      agent: "claude",
    } as const;
    saveSessionsListPreferences(localStorage, value);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(value);

    const failingStorage = {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      setItem: vi.fn(() => {
        throw new Error("full");
      }),
    } as unknown as Storage;
    expect(loadSessionsListPreferences(failingStorage)).toEqual(
      DEFAULT_SESSIONS_LIST_PREFERENCES,
    );
    expect(() =>
      saveSessionsListPreferences(failingStorage, value),
    ).not.toThrow();
  });
});
