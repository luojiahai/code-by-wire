import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Family, Subagent } from "@shared/types";
import { normalizeModelId } from "@shared/models";
import { num, parseJsonlRows } from "./transcript-row";
import { newestMtime } from "./dir-mtime";

/** The `.meta.json` companion of a subagent transcript. */
export interface SubagentMeta {
  agentType: string;
  /** The id of the Task/Agent tool_use that spawned this subagent — the link to its parent. */
  toolUseId: string;
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
  /** tool_use_id → is_error, for the tool_results recorded in this transcript. */
  results: Map<string, boolean>;
  /** First raw model string seen on an assistant row, normalized later; undefined when none reported. */
  model: string | undefined;
  /** Summed input + output tokens, counted once per assistant turn (keyed on message.id, since Claude
   *  Code writes one turn across many rows that repeat the same usage). Cache excluded — the Cost panel
   *  owns cache. */
  tokens: number;
  /** Min / max parseable timestamp (ms); duration is their difference. */
  firstTs: number;
  lastTs: number;
}

function scanRows(rows: any[]): Scan {
  const toolUseIds = new Set<string>();
  const results = new Map<string, boolean>();
  let model: string | undefined;
  let tokens = 0;
  let firstTs = Infinity;
  let lastTs = -Infinity;
  // message ids whose usage is already counted: one assistant turn spans several rows that repeat the
  // same id and usage, so counting per row would multiply the total (the summary parser dedups the same
  // way; on real transcripts this is 2x–70x inflation).
  const counted = new Set<string>();
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
      if (u && typeof u === "object") {
        const id = typeof msg?.id === "string" ? msg.id : undefined;
        if (!id || !counted.has(id)) {
          if (id) counted.add(id);
          tokens += num(u.input_tokens) + num(u.output_tokens);
        }
      }
    }
    const content = msg?.content;
    if (Array.isArray(content)) {
      for (const b of content) {
        if (b?.type === "tool_use" && typeof b.id === "string")
          toolUseIds.add(b.id);
        if (b?.type === "tool_result" && typeof b.tool_use_id === "string")
          results.set(b.tool_use_id, !!b.is_error);
      }
    }
  }
  return { toolUseIds, results, model, tokens, firstTs, lastTs };
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
      children: [],
    };
    if (model) node.model = model;
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

/** Newest mtime (ms) among the `agent-*.jsonl` files, or 0 when the dir is absent/empty. The transcript
 *  read folds this into its change token so a running subagent's growth re-triggers a poll. */
export function subagentsNewestMtime(dir: string): number {
  return newestMtime(dir, (name) => name.endsWith(".jsonl"));
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
