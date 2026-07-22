import { spawn } from "node:child_process";
import { toSpawnForm } from "../../terminal/command";
import { findOnPath, isExecutableFile } from "../../terminal/shell-command";
import { asRecord } from "./rollout";

export const APP_SERVER_INIT_TIMEOUT_MS = 8_000;
export const APP_SERVER_REQUEST_TIMEOUT_MS = 3_000;

/** The narrow child surface the one-shot App Server client drives. Method syntax keeps loose test
 * fakes assignable alongside Node's ChildProcess. */
export interface AppServerChild {
  stdin: { write(data: string): void; end(): void } | null;
  stdout: {
    setEncoding(enc: string): void;
    on(ev: "data", cb: (d: string) => void): void;
  } | null;
  on(ev: "error", cb: (err: Error) => void): void;
  on(ev: "close", cb: (code: number | null) => void): void;
  kill(): boolean | void;
}

export type AppServerSpawn = (
  file: string,
  args: string[],
  opts: { detached: boolean; stdio: ["pipe", "pipe", "ignore"] },
) => AppServerChild;

export interface AppServerClient {
  request(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

export interface AppServerDeps {
  spawnFn?: AppServerSpawn;
  platform?: NodeJS.Platform;
}

const realAppServerSpawn: AppServerSpawn = (file, args, opts) =>
  spawn(file, args, opts);

const APP_SERVER_ARGS = ["-s", "read-only", "-a", "untrusted", "app-server"];

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

/**
 * Run a bounded sequence of JSON-RPC requests against a fresh `codex app-server` process. The
 * process is initialized once, shared by the callback's requests, and always terminated afterward.
 * Any spawn/protocol/timeout failure settles as null so optional Codex integrations never block the
 * session list.
 */
export async function withCodexAppServer<T>(
  run: (client: AppServerClient) => Promise<T | null>,
  deps: AppServerDeps = {},
): Promise<T | null> {
  const spawnFn = deps.spawnFn ?? realAppServerSpawn;
  const platform = deps.platform ?? process.platform;
  let child: AppServerChild;
  try {
    const { file, args } = toSpawnForm(
      { file: "codex", args: APP_SERVER_ARGS },
      platform,
      platform === "win32"
        ? undefined
        : {
            env: process.env,
            isExecutable: isExecutableFile,
            findOnPath: (name) => findOnPath(name, process.env),
          },
    );
    child = spawnFn(file, args, {
      detached: platform !== "win32",
      stdio: ["pipe", "pipe", "ignore"],
    });
  } catch {
    return null;
  }

  let nextId = 1;
  let closed = false;
  let buffer = "";
  const pending = new Map<number, PendingRequest>();

  const failAll = (error: Error): void => {
    if (closed) return;
    closed = true;
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    pending.clear();
  };

  const send = (message: Record<string, unknown>): void => {
    if (closed) throw new Error("Codex App Server is closed");
    child.stdin?.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
  };

  const requestWithTimeout = (
    method: string,
    params: Record<string, unknown> | undefined,
    timeoutMs: number,
  ): Promise<unknown> => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Codex App Server request timed out: ${method}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      try {
        send({ id, method, ...(params === undefined ? {} : { params }) });
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  };

  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (data: string) => {
    buffer += data;
    let newline: number;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let row: Record<string, unknown> | null;
      try {
        row = asRecord(JSON.parse(line));
      } catch {
        continue;
      }
      if (!row || typeof row.id !== "number") continue;
      const p = pending.get(row.id);
      if (!p) continue;
      clearTimeout(p.timer);
      pending.delete(row.id);
      if (row.error !== undefined)
        p.reject(new Error(`Codex App Server rejected request ${row.id}`));
      else p.resolve(row.result);
    }
  });
  child.on("error", (error) => failAll(error));
  child.on("close", () => failAll(new Error("Codex App Server closed")));

  const client: AppServerClient = {
    request: (method, params) =>
      requestWithTimeout(method, params, APP_SERVER_REQUEST_TIMEOUT_MS),
  };

  try {
    await requestWithTimeout(
      "initialize",
      {
        clientInfo: {
          name: "code-by-wire",
          title: "code by wire",
          version: "0",
        },
      },
      APP_SERVER_INIT_TIMEOUT_MS,
    );
    send({ method: "initialized" });
    return await run(client);
  } catch {
    return null;
  } finally {
    failAll(new Error("Codex App Server request complete"));
    try {
      child.stdin?.end();
    } catch {
      // already closed
    }
    try {
      child.kill();
    } catch {
      // already dead
    }
  }
}
