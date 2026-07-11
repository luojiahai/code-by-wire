import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Family, Subagent } from "@shared/types";
import { normalizeModelId } from "@shared/models";
import { parseJsonlRows } from "./transcript-row";
import { newestMtime } from "./dir-mtime";
import { readUsage } from "./usage-accumulator";

/** The `.meta.json` companion of a subagent transcript. */
export interface SubagentMeta {
  agentType: string;
  /** The id of the Task/Agent tool_use that spawned this subagent — the link to its parent. */
  toolUseId: string;
  /** The dispatch's task label (the Agent/Task tool's `description` arg), surfaced onto the lane. */
  description: string;
}

/** One subagent's reconstruction inputs: its id, its meta, and its parsed transcript rows. */
export interface SubagentSource {
  agentId: string;
  meta: SubagentMeta;
  rows: any[];
}

/** What a single transcript (the main one, or one subagent's) contributes to reconstruction. */
interface Scan {
  /** tool_use ids dispatched in this transcript — used to find which agent (or main) owns a child. */
  toolUseIds: Set<string>;
  /** tool_use id → the assistant message.id that carried it; the dispatch-batch key for grouping. */
  dispatchMsgOf: Map<string, string>;
  /** tool_use_id → is_error, for the tool_results recorded in this transcript. */
  results: Map<string, boolean>;
  /** First raw model string seen on an assistant row, normalized later; undefined when none reported. */
  model: string | undefined;
  /** The Claude Code CLI's per-agent token count: the LAST assistant usage snapshot's input + output
   *  + cache read + cache creation — the turn's full context footprint. Matches the CLI's live counter
   *  and its "Done (N tool uses · X tokens)" line (both read findLast(assistant).usage across all four
   *  fields), so the lane agrees with the number the CLI showed for the same agent. Cumulative billed
   *  volume is a different metric; the Cost panel owns that. */
  tokens: number;
  /** Min / max parseable timestamp (ms); duration is their difference. */
  firstTs: number;
  lastTs: number;
}

function scanRows(rows: any[]): Scan {
  const toolUseIds = new Set<string>();
  const dispatchMsgOf = new Map<string, string>();
  const results = new Map<string, boolean>();
  let model: string | undefined;
  let firstTs = Infinity;
  let lastTs = -Infinity;
  // The usage block of the last assistant row that carried one. Rows are file-ordered and one turn's
  // progressive streaming snapshots repeat its message id consecutively, so this IS the final
  // snapshot of the final turn — the same block the CLI's findLast(assistant) reads, EXCEPT when the
  // literal last assistant row has no usage (e.g. a synthetic error row): the CLI would then read 0,
  // while this deliberately keeps the last known usage instead. That's the better number, not a bug.
  let lastUsage: unknown;
  for (const row of rows) {
    const ts =
      typeof row?.timestamp === "string" ? Date.parse(row.timestamp) : NaN;
    if (!Number.isNaN(ts)) {
      if (ts < firstTs) firstTs = ts;
      if (ts > lastTs) lastTs = ts;
    }
    const msg = row?.message;
    if (row?.type === "assistant") {
      if (!model && typeof msg?.model === "string") model = msg.model;
      const u = msg?.usage;
      if (u && typeof u === "object") lastUsage = u;
    }
    const content = msg?.content;
    if (Array.isArray(content)) {
      for (const b of content) {
        if (b?.type === "tool_use" && typeof b.id === "string") {
          toolUseIds.add(b.id);
          if (typeof msg?.id === "string") dispatchMsgOf.set(b.id, msg.id);
        }
        if (b?.type === "tool_result" && typeof b.tool_use_id === "string")
          results.set(b.tool_use_id, !!b.is_error);
      }
    }
  }
  // readUsage of an absent block is all zeros, so a usage-less agent scans to tokens: 0.
  const last = readUsage(lastUsage);
  return {
    toolUseIds,
    dispatchMsgOf,
    results,
    model,
    tokens:
      last.inputTokens +
      last.outputTokens +
      last.cacheReadTokens +
      last.cacheCreationTokens,
    firstTs,
    lastTs,
  };
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Does `start`'s parent chain reach `target`? Used to reject a link that would close a cycle; the seen
 *  guard also walks safely past a pre-existing cycle. */
function reaches(
  start: string,
  target: string,
  parentOf: Map<string, string>,
): boolean {
  let cur: string | undefined = start;
  const seen = new Set<string>();
  while (cur !== undefined) {
    if (cur === target) return true;
    if (seen.has(cur)) return false;
    seen.add(cur);
    cur = parentOf.get(cur);
  }
  return false;
}

/**
 * Reconstruct the subagent forest from the main transcript's rows and each subagent's rows + meta. A
 * root subagent is dispatched from the main transcript; a nested one is dispatched from inside its
 * parent agent's transcript. Status comes from the dispatch's tool_result (absent ⇒ working, is_error ⇒
 * failed, else done). The output is always an acyclic forest, even on malformed input. Pure: same input,
 * same output.
 */
export function buildSubagentForest(
  mainRows: any[],
  agents: SubagentSource[],
): Subagent[] {
  const mainScan = scanRows(mainRows);
  const scans = new Map<string, Scan>();
  for (const a of agents) scans.set(a.agentId, scanRows(a.rows));

  // dispatcher[toolUseId] = the agentId that dispatched it, or null for the main transcript. tool_use
  // ids are globally unique, so one flat map over every transcript suffices; the main wins a collision.
  const dispatcher = new Map<string, string | null>();
  for (const a of agents)
    for (const id of scans.get(a.agentId)!.toolUseIds)
      dispatcher.set(id, a.agentId);
  for (const id of mainScan.toolUseIds) dispatcher.set(id, null);

  // tool_use_id → is_error of its result, merged once across every transcript (main wins a collision).
  const results = new Map<string, boolean>();
  for (const a of agents)
    for (const [id, err] of scans.get(a.agentId)!.results) results.set(id, err);
  for (const [id, err] of mainScan.results) results.set(id, err);

  // tool_use id → its dispatching assistant message id, merged across every transcript (main wins).
  // Message ids are globally unique, so a collision is not expected; main-wins keeps the rule uniform.
  const dispatchMsgOf = new Map<string, string>();
  for (const a of agents)
    for (const [id, mid] of scans.get(a.agentId)!.dispatchMsgOf)
      dispatchMsgOf.set(id, mid);
  for (const [id, mid] of mainScan.dispatchMsgOf) dispatchMsgOf.set(id, mid);

  const nodeById = new Map<string, Subagent>();
  for (const a of agents) {
    const s = scans.get(a.agentId)!;
    const status: Subagent["status"] = !results.has(a.meta.toolUseId)
      ? "working"
      : results.get(a.meta.toolUseId)
        ? "failed"
        : "done";
    // No assistant row reported a model yet (e.g. a just-spawned agent): leave it unset rather than
    // asserting the Opus normalize-fallback as a real label.
    const model: Family | undefined =
      s.model !== undefined ? normalizeModelId(s.model) : undefined;
    const durationMs =
      Number.isFinite(s.firstTs) && s.lastTs >= s.firstTs
        ? s.lastTs - s.firstTs
        : 0;
    const node: Subagent = {
      id: a.agentId,
      type: a.meta.agentType,
      status,
      tokens: s.tokens,
      durationMs,
      toolCount: s.toolUseIds.size,
      children: [],
    };
    if (model) node.model = model;
    if (Number.isFinite(s.firstTs)) node.startMs = s.firstTs;
    const description = a.meta.description.trim();
    if (description) node.description = description;
    const batchId = dispatchMsgOf.get(a.meta.toolUseId);
    if (batchId !== undefined) node.batchId = batchId;
    if (a.meta.toolUseId) node.dispatchId = a.meta.toolUseId;
    nodeById.set(a.agentId, node);
  }

  // Resolve each agent's parent: the agent that dispatched its toolUseId, when that's a known, different
  // agent. An empty/unknown toolUseId, or one the main transcript dispatched, makes the agent a root.
  const parentOf = new Map<string, string>();
  for (const a of agents) {
    const tid = a.meta.toolUseId;
    if (!tid) continue;
    const p = dispatcher.get(tid);
    if (p && p !== a.agentId && nodeById.has(p)) parentOf.set(a.agentId, p);
  }

  // Link in dispatch order (the agent's own first timestamp; agentId breaks ties so a timestamp-less
  // agent sorts deterministically and the comparator never returns NaN). Skip a link that would close a
  // cycle, so the forest stays acyclic and the renderer can recurse it safely.
  const ordered = [...agents].sort((x, y) => {
    const fx = scans.get(x.agentId)!.firstTs;
    const fy = scans.get(y.agentId)!.firstTs;
    return fx === fy ? cmp(x.agentId, y.agentId) : fx - fy;
  });
  const roots: Subagent[] = [];
  for (const a of ordered) {
    const node = nodeById.get(a.agentId)!;
    const parentId = parentOf.get(a.agentId);
    if (parentId !== undefined && !reaches(parentId, a.agentId, parentOf)) {
      nodeById.get(parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }

  // Drop empty children arrays so the output matches the optional `children?` shape.
  for (const node of nodeById.values())
    if (node.children && node.children.length === 0) delete node.children;
  return roots;
}

/** projects/<proj>/<sid>.jsonl → projects/<proj>/<sid>/subagents */
export function subagentsDirFor(transcriptPath: string): string {
  return join(
    dirname(transcriptPath),
    basename(transcriptPath, ".jsonl"),
    "subagents",
  );
}

/** projects/<proj>/<sid>.jsonl → projects/<proj>/subagents — the FLAT layout some CLI builds write
 *  (ccstatusline probes both, jsonl-metrics.ts:442-491). Shared by every session in the project
 *  dir, so its files count only when referenced by this session's transcript — see
 *  listSessionSubagentFiles. */
export function subagentsFlatDirFor(transcriptPath: string): string {
  return join(dirname(transcriptPath), "subagents");
}

/** Every `agentId` string referenced anywhere in the transcript's rows (deep walk — ccstatusline's
 *  getReferencedSubagentIds). This set is what scopes the shared flat subagents dir to ONE session. */
export function collectReferencedAgentIds(jsonl: string): Set<string> {
  const ids = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (
        key === "agentId" &&
        typeof nested === "string" &&
        nested.trim() !== ""
      )
        ids.add(nested);
      walk(nested);
    }
  };
  for (const row of parseJsonlRows(jsonl)) walk(row);
  return ids;
}

/**
 * A session's subagent files across BOTH layouts: the per-session dir unguarded (the dir is owned
 * by the session — gating it on references would regress usage-accuracy coverage), the flat dir
 * gated on referenced agent ids (it is shared — an unreferenced file there belongs to another
 * session). `referencedIds` is a thunk, paid only when flat files exist. Deduped by path.
 */
export function listSessionSubagentFiles(
  transcriptPath: string,
  sessionId: string,
  referencedIds: () => Set<string>,
): SubagentFileEntry[] {
  const out = listSubagentFiles(subagentsDirFor(transcriptPath), sessionId);
  const flat = listSubagentFiles(
    subagentsFlatDirFor(transcriptPath),
    sessionId,
  );
  if (flat.length > 0) {
    const ids = referencedIds();
    const seen = new Set(out.map((e) => e.path));
    for (const entry of flat) {
      const agentId = entry.name.slice("agent-".length, -".jsonl".length);
      if (!ids.has(agentId) || seen.has(entry.path)) continue;
      out.push(entry);
    }
  }
  return out;
}

/** One agent-*.jsonl entry in a session's subagents dir, ready to read or stat. */
export interface SubagentFileEntry {
  name: string;
  path: string;
  /** Mirrors the analytics scan's keyPrefix so id-less turn surrogate keys match across both paths. */
  keyPrefix: string;
}

/** All `agent-*.jsonl` files in `dir`, with their full paths and analytics keyPrefixes. Returns [] when
 *  the dir is absent or unreadable. The single filter definition shared by usageByModelFor and
 *  collectScanTargets so a file-naming change stays in one place. */
export function listSubagentFiles(
  dir: string,
  sessionId: string,
): SubagentFileEntry[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out: SubagentFileEntry[] = [];
  for (const name of names) {
    if (!name.startsWith("agent-") || !name.endsWith(".jsonl")) continue;
    out.push({
      name,
      path: join(dir, name),
      keyPrefix: `${sessionId}/${name}`,
    });
  }
  return out;
}

/** projects/<proj>/<sid>.jsonl + agentId → that subagent's own transcript file. */
export function subagentFileFor(
  transcriptPath: string,
  agentId: string,
): string {
  return join(subagentsDirFor(transcriptPath), `agent-${agentId}.jsonl`);
}

/** Newest mtime (ms) among the `agent-*.jsonl` files, or 0 when the dir is absent/empty. The transcript
 *  read folds this into its change token so a running subagent's growth re-triggers a poll. Filter
 *  matches usageByModelFor exactly — other .jsonl files (journal.jsonl, etc.) must not advance the token. */
export function subagentsNewestMtime(dir: string): number {
  return newestMtime(
    dir,
    (name) => name.startsWith("agent-") && name.endsWith(".jsonl"),
  );
}

/** Read every `agent-<id>.meta.json` + `agent-<id>.jsonl` pair in a subagents dir into reconstruction
 *  inputs. A missing dir, a bad meta, or an unreadable transcript is skipped, never fatal. */
export function readSubagentSources(dir: string): SubagentSource[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out: SubagentSource[] = [];
  for (const name of names) {
    if (!name.startsWith("agent-") || !name.endsWith(".meta.json")) continue;
    const agentId = name.slice("agent-".length, -".meta.json".length);
    let meta: SubagentMeta;
    try {
      const m = JSON.parse(readFileSync(join(dir, name), "utf8"));
      meta = {
        agentType: typeof m.agentType === "string" ? m.agentType : "",
        toolUseId: typeof m.toolUseId === "string" ? m.toolUseId : "",
        description: typeof m.description === "string" ? m.description : "",
      };
    } catch {
      continue;
    }
    let rows: any[];
    try {
      rows = parseJsonlRows(
        readFileSync(join(dir, `agent-${agentId}.jsonl`), "utf8"),
      );
    } catch {
      rows = [];
    }
    out.push({ agentId, meta, rows });
  }
  return out;
}
