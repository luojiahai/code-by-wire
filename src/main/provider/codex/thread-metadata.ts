import { asRecord } from "./rollout";
import { MAX_SESSION_TITLE_LEN } from "@shared/title-override";
import {
  withCodexAppServer,
  type AppServerDeps,
  type AppServerClient,
} from "./app-server";

export interface CodexThreadMetadata {
  name: string | null;
  preview: string;
}

export interface CodexThreadMetadataService {
  read(id: string): CodexThreadMetadata | null;
  refresh(): Promise<void>;
  setName(id: string, name: string): Promise<boolean>;
}

export interface CodexThreadMetadataDeps extends AppServerDeps {
  now?: () => number;
}

export const CODEX_THREAD_METADATA_TTL_MS = 15_000;
export const CODEX_THREAD_METADATA_FAILURE_TTL_MS = 300_000;

const THREAD_SOURCE_KINDS = [
  "cli",
  "vscode",
  "exec",
  "appServer",
  "subAgent",
  "subAgentReview",
  "subAgentCompact",
  "subAgentThreadSpawn",
  "subAgentOther",
  "unknown",
];

/** Decode one stable thread/list page. A malformed envelope fails the whole refresh so the caller
 * retains its last complete snapshot; malformed individual rows are ignored. */
export function parseThreadListPage(result: unknown): {
  data: Map<string, CodexThreadMetadata>;
  nextCursor: string | null;
} | null {
  const root = asRecord(result);
  if (!root || !Array.isArray(root.data)) return null;
  const next = root.nextCursor;
  if (next !== undefined && next !== null && typeof next !== "string")
    return null;
  const data = new Map<string, CodexThreadMetadata>();
  for (const item of root.data) {
    const row = asRecord(item);
    if (!row || typeof row.id !== "string") continue;
    const name = typeof row.name === "string" ? row.name : null;
    data.set(row.id, {
      name,
      preview: typeof row.preview === "string" ? row.preview : "",
    });
  }
  return { data, nextCursor: typeof next === "string" ? next : null };
}

async function fetchAllThreadMetadata(
  client: AppServerClient,
): Promise<Map<string, CodexThreadMetadata> | null> {
  const all = new Map<string, CodexThreadMetadata>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = parseThreadListPage(
      await client.request("thread/list", {
        archived: false,
        cursor,
        limit: 100,
        sortKey: "created_at",
        sortDirection: "desc",
        sourceKinds: THREAD_SOURCE_KINDS,
        useStateDbOnly: true,
      }),
    );
    if (!page) return null;
    for (const [id, metadata] of page.data) all.set(id, metadata);
    cursor = page.nextCursor;
    if (cursor !== null && seenCursors.has(cursor)) return null;
    if (cursor !== null) seenCursors.add(cursor);
  } while (cursor !== null);
  return all;
}

/** Renderer-poll-driven metadata cache. refresh() is awaitable so a due App Server read lands before
 * the same synchronization pass; failures retain the last complete snapshot and back off. */
export function createCodexThreadMetadataService(
  deps: CodexThreadMetadataDeps = {},
): CodexThreadMetadataService {
  const now = deps.now ?? (() => Date.now());
  let data = new Map<string, CodexThreadMetadata>();
  let nextAttemptAt = 0;
  let inflight: Promise<void> | null = null;

  const fetch = async (): Promise<void> => {
    const result = await withCodexAppServer(fetchAllThreadMetadata, deps);
    if (result !== null) {
      data = result;
      nextAttemptAt = now() + CODEX_THREAD_METADATA_TTL_MS;
    } else {
      nextAttemptAt = now() + CODEX_THREAD_METADATA_FAILURE_TTL_MS;
    }
  };

  return {
    read: (id) => data.get(id) ?? null,
    refresh() {
      if (now() < nextAttemptAt) return Promise.resolve();
      if (!inflight) {
        inflight = fetch().finally(() => {
          inflight = null;
        });
      }
      return inflight;
    },
    async setName(id, name) {
      const trimmed = name.trim().slice(0, MAX_SESSION_TITLE_LEN);
      if (!trimmed) return false;
      const succeeded = await withCodexAppServer(async (client) => {
        await client.request("thread/name/set", {
          threadId: id,
          name: trimmed,
        });
        return true;
      }, deps);
      if (succeeded !== true) return false;
      const previous = data.get(id);
      data.set(id, { name: trimmed, preview: previous?.preview ?? "" });
      nextAttemptAt = now() + CODEX_THREAD_METADATA_TTL_MS;
      return true;
    },
  };
}
