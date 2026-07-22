import { beforeEach, describe, expect, it, vi } from "vitest";

const updaterMock = vi.hoisted(() => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  return {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    allowPrerelease: true,
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      listeners.set(event, listener);
    }),
    emit(event: string, ...args: unknown[]) {
      listeners.get(event)?.(...args);
    },
    checkForUpdates: vi.fn<() => Promise<void>>(),
    downloadUpdate: vi.fn<() => Promise<void>>(),
    quitAndInstall: vi.fn(),
  };
});

vi.mock("electron-updater", () => ({ autoUpdater: updaterMock }));

import { createUpdater } from "../src/main/updater";

describe("createUpdater", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not apply a rejected check twice after the error event restores an available update", async () => {
    const updater = createUpdater({
      send: vi.fn(),
      isPackaged: true,
      currentVersion: "0.1.16",
    });
    updaterMock.emit("update-available", {
      version: "0.1.17",
      releaseDate: "2026-07-20",
    });
    const before = updater.getState();
    const failure = new Error("offline");
    updaterMock.checkForUpdates.mockImplementationOnce(() => {
      updaterMock.emit("checking-for-update");
      updaterMock.emit("error", failure);
      return Promise.reject(failure);
    });

    await expect(updater.check()).resolves.toEqual(before);
    expect(updater.getState()).toEqual(before);
  });
});
