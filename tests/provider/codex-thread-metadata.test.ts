import { describe, expect, it } from "vitest";
import {
  createCodexThreadMetadataService,
  parseThreadListPage,
} from "../../src/main/provider/codex/thread-metadata";
import type {
  AppServerChild,
  AppServerSpawn,
} from "../../src/main/provider/codex/app-server";

interface RpcMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
}

function scriptedChild(
  respond: (message: RpcMessage, emit: (result: unknown) => void) => void,
): AppServerChild {
  let onData: ((data: string) => void) | null = null;
  let onClose: ((code: number | null) => void) | null = null;
  let closed = false;
  return {
    stdin: {
      write(data) {
        const message = JSON.parse(data) as RpcMessage;
        queueMicrotask(() =>
          respond(message, (result) => {
            if (message.id !== undefined)
              onData?.(`${JSON.stringify({ id: message.id, result })}\n`);
          }),
        );
      },
      end() {},
    },
    stdout: {
      setEncoding() {},
      on(_event, callback) {
        onData = callback;
      },
    },
    on(event, callback) {
      if (event === "close")
        onClose = callback as (code: number | null) => void;
    },
    kill() {
      if (closed) return;
      closed = true;
      onClose?.(null);
    },
  };
}

describe("parseThreadListPage", () => {
  it("decodes native names/previews and rejects a malformed envelope", () => {
    const page = parseThreadListPage({
      data: [
        { id: "a", name: "Named", preview: "Preview A" },
        { id: "b", name: null, preview: "Preview B" },
        { broken: true },
      ],
      nextCursor: "next",
    });
    expect(page?.data.get("a")).toEqual({
      name: "Named",
      preview: "Preview A",
    });
    expect(page?.data.get("b")).toEqual({
      name: null,
      preview: "Preview B",
    });
    expect(page?.nextCursor).toBe("next");
    expect(parseThreadListPage({ data: {}, nextCursor: null })).toBeNull();
  });
});

describe("createCodexThreadMetadataService", () => {
  it("paginates stable thread/list, honors the TTL, and retains the last complete snapshot on failure", async () => {
    let now = 1_000;
    let spawns = 0;
    const listParams: Record<string, unknown>[] = [];
    const spawnFn: AppServerSpawn = () => {
      const attempt = ++spawns;
      return scriptedChild((message, emit) => {
        if (message.method === "initialize") emit({});
        if (message.method !== "thread/list") return;
        listParams.push(message.params ?? {});
        if (attempt === 2) {
          emit({ malformed: true });
          return;
        }
        if (message.params?.cursor === null)
          emit({
            data: [{ id: "a", name: null, preview: "First request" }],
            nextCursor: "page-2",
          });
        else
          emit({
            data: [{ id: "b", name: "Second", preview: "Second request" }],
            nextCursor: null,
          });
      });
    };
    const service = createCodexThreadMetadataService({
      spawnFn,
      platform: "win32",
      now: () => now,
    });

    await service.refresh();
    expect(service.read("a")?.preview).toBe("First request");
    expect(service.read("b")?.name).toBe("Second");
    expect(listParams[0]).toMatchObject({
      cursor: null,
      limit: 100,
      useStateDbOnly: true,
    });
    await service.refresh();
    expect(spawns).toBe(1);

    now += 15_001;
    await service.refresh();
    expect(spawns).toBe(2);
    expect(service.read("a")?.preview).toBe("First request");
    await service.refresh();
    expect(spawns).toBe(2); // failure TTL suppresses another process
  });

  it("writes a native name and updates the in-memory title immediately", async () => {
    const requests: RpcMessage[] = [];
    let spawns = 0;
    const spawnFn: AppServerSpawn = () => {
      const attempt = ++spawns;
      return scriptedChild((message, emit) => {
        requests.push(message);
        if (message.method === "initialize") emit({});
        else if (message.method === "thread/list")
          emit({
            data: [{ id: "a", name: null, preview: "Original prompt" }],
            nextCursor: null,
          });
        else if (attempt === 2 && message.method === "thread/name/set")
          emit({});
      });
    };
    const service = createCodexThreadMetadataService({
      spawnFn,
      platform: "win32",
      now: () => 1_000,
    });
    await service.refresh();

    expect(await service.setName("a", "  Better title  ")).toBe(true);
    expect(service.read("a")).toEqual({
      name: "Better title",
      preview: "Original prompt",
    });
    expect(
      requests.find((request) => request.method === "thread/name/set")?.params,
    ).toEqual({ threadId: "a", name: "Better title" });
  });

  it("clears a native name by restoring the preview title", async () => {
    const requests: RpcMessage[] = [];
    const spawnFn: AppServerSpawn = () =>
      scriptedChild((message, emit) => {
        requests.push(message);
        if (message.method === "initialize") emit({});
        else if (message.method === "thread/list")
          emit({
            data: [{ id: "a", name: "Custom", preview: "Original prompt" }],
            nextCursor: null,
          });
        else if (message.method === "thread/name/set") emit({});
      });
    const service = createCodexThreadMetadataService({
      spawnFn,
      platform: "win32",
      now: () => 1_000,
    });
    await service.refresh();

    expect(await service.setName("a", null)).toBe(true);
    expect(service.read("a")).toEqual({
      name: null,
      preview: "Original prompt",
    });
    expect(
      requests.find((request) => request.method === "thread/name/set")?.params,
    ).toEqual({ threadId: "a", name: "Original prompt" });
  });

  it("discards a stale refresh that finishes after a native rename", async () => {
    let now = 1_000;
    let attempt = 0;
    let releaseStale!: () => void;
    let staleRequestedResolve!: () => void;
    const staleRequested = new Promise<void>((resolve) => {
      staleRequestedResolve = resolve;
    });
    const spawnFn: AppServerSpawn = () => {
      const currentAttempt = ++attempt;
      return scriptedChild((message, emit) => {
        if (message.method === "initialize") emit({});
        else if (message.method === "thread/list") {
          const oldSnapshot = {
            data: [{ id: "a", name: "Old name", preview: "Original prompt" }],
            nextCursor: null,
          };
          if (currentAttempt === 2) {
            releaseStale = () => emit(oldSnapshot);
            staleRequestedResolve();
          } else {
            emit(oldSnapshot);
          }
        } else if (message.method === "thread/name/set") emit({});
      });
    };
    const service = createCodexThreadMetadataService({
      spawnFn,
      platform: "win32",
      now: () => now,
    });
    await service.refresh();
    now += 15_001;

    const staleRefresh = service.refresh();
    await staleRequested;
    expect(await service.setName("a", "New name")).toBe(true);
    releaseStale();
    await staleRefresh;

    expect(service.read("a")).toEqual({
      name: "New name",
      preview: "Original prompt",
    });
  });
});
