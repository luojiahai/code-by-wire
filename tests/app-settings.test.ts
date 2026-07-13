import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppSettingsStore } from "../src/main/app-settings";

describe("createAppSettingsStore", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  function tmp(): string {
    const d = mkdtempSync(join(tmpdir(), "cbw-app-settings-"));
    dirs.push(d);
    return d;
  }

  it("reads an empty object when the file is absent", () => {
    expect(createAppSettingsStore({ dir: tmp() }).read()).toEqual({});
  });
  it("persists and reads back the binary-path override", () => {
    const dir = tmp();
    createAppSettingsStore({ dir }).setClaudeBinPath("/custom/claude");
    expect(createAppSettingsStore({ dir }).read().claudeBinPath).toBe(
      "/custom/claude",
    );
  });
  it("clears the override when set to null", () => {
    const dir = tmp();
    const store = createAppSettingsStore({ dir });
    store.setClaudeBinPath("/custom/claude");
    store.setClaudeBinPath(null);
    expect(store.read().claudeBinPath ?? null).toBeNull();
  });
  it("tolerates a corrupt settings file by reading empty", () => {
    const dir = tmp();
    writeFileSync(join(dir, "settings.json"), "{ not json");
    expect(createAppSettingsStore({ dir }).read()).toEqual({});
  });
  it("leaves autoCheckUpdates undefined by default (treated as on)", () => {
    expect(
      createAppSettingsStore({ dir: tmp() }).read().autoCheckUpdates,
    ).toBeUndefined();
  });
  it("persists autoCheckUpdates=false and reads it back", () => {
    const dir = tmp();
    createAppSettingsStore({ dir }).setAutoCheckUpdates(false);
    expect(createAppSettingsStore({ dir }).read().autoCheckUpdates).toBe(false);
  });
  it("keeps the binary override when toggling auto-check", () => {
    const dir = tmp();
    const store = createAppSettingsStore({ dir });
    store.setClaudeBinPath("/custom/claude");
    store.setAutoCheckUpdates(false);
    expect(store.read().claudeBinPath).toBe("/custom/claude");
    expect(store.read().autoCheckUpdates).toBe(false);
  });
});

describe("statuslineEnabled preference", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  function tmp(): string {
    const d = mkdtempSync(join(tmpdir(), "cbw-app-settings-"));
    dirs.push(d);
    return d;
  }

  it("is absent by default (callers read ?? true), persists false, and round-trips", () => {
    const dir = tmp();
    const store = createAppSettingsStore({ dir });

    expect(store.read().statuslineEnabled).toBeUndefined();

    store.setStatuslineEnabled(false);
    expect(store.read().statuslineEnabled).toBe(false);
    // persisted, not just in memory
    expect(
      JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"))
        .statuslineEnabled,
    ).toBe(false);

    store.setStatuslineEnabled(true);
    expect(store.read().statuslineEnabled).toBe(true);
  });

  it("preserves other keys when toggling", () => {
    const dir = tmp();
    const store = createAppSettingsStore({ dir });
    store.setClaudeBinPath("/opt/claude");
    store.setStatuslineEnabled(false);
    expect(store.read().claudeBinPath).toBe("/opt/claude");
  });
});

describe("notifyOnAwaiting preference", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  function tmp(): string {
    const d = mkdtempSync(join(tmpdir(), "cbw-app-settings-"));
    dirs.push(d);
    return d;
  }

  it("is absent by default (callers read ?? true), persists false, and round-trips", () => {
    const dir = tmp();
    const store = createAppSettingsStore({ dir });

    expect(store.read().notifyOnAwaiting).toBeUndefined();

    store.setNotifyOnAwaiting(false);
    expect(store.read().notifyOnAwaiting).toBe(false);
    // persisted, not just in memory
    expect(
      JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"))
        .notifyOnAwaiting,
    ).toBe(false);

    store.setNotifyOnAwaiting(true);
    expect(store.read().notifyOnAwaiting).toBe(true);
  });

  it("preserves other keys when toggling", () => {
    const dir = tmp();
    const store = createAppSettingsStore({ dir });
    store.setClaudeBinPath("/opt/claude");
    store.setNotifyOnAwaiting(false);
    expect(store.read().claudeBinPath).toBe("/opt/claude");
  });
});
