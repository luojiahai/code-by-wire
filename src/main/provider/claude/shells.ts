// src/main/provider/claude/shells.ts
import type { BackgroundShell } from "@shared/types";
import { userText } from "./transcript-row";

/** Reconstruction output: the renderer-facing shell plus the absolute `.output` path the provider needs
 *  to read the live log (stripped before the list crosses IPC). */
export interface ShellRecord extends BackgroundShell {
  outputFile: string;
}

/** A backgrounded Bash tool_use, keyed by its tool_use id. */
interface BashUse {
  command: string;
  description?: string;
}

const KILL_TOOLS = new Set(["KillShell", "KillBash", "TaskStop"]);

/** Pull the absolute output path out of the start tool_result text:
 *  "...Output is being written to: <path>". Empty when the line shape changed. */
function outputPathFromStart(content: unknown): string {
  const m = userText(content).match(/Output is being written to:\s*(\S+)/);
  return m ? m[1].replace(/[.\s]+$/, "") : "";
}

/** Read a single tag's text out of a <task-notification> body. */
function tag(body: string, name: string): string | undefined {
  const m = body.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() : undefined;
}

/**
 * Reconstruct the background-shell list from the main transcript rows. Pure: same rows, same output.
 * Detection is scoped to a Bash tool_result with a backgroundTaskId, so subagent dispatches (Agent/Task)
 * never appear. Status/exit/duration come from the completion <task-notification>; a kill tool_use marks
 * a still-running shell killed. Ordered by start time.
 */
export function reconstructShells(rows: any[]): ShellRecord[] {
  const bashUses = new Map<string, BashUse>();
  const killed = new Set<string>(); // task ids referenced by a kill tool_use
  // First pass: index Bash tool_uses (the command source + the scope guard) and kill references.
  for (const row of rows) {
    const content = row?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (b?.type !== "tool_use" || typeof b.id !== "string") continue;
      if (b.name === "Bash" && typeof b.input?.command === "string") {
        const use: BashUse = { command: b.input.command };
        if (typeof b.input.description === "string" && b.input.description)
          use.description = b.input.description;
        bashUses.set(b.id, use);
      } else if (KILL_TOOLS.has(b.name)) {
        const ref =
          b.input?.shell_id ??
          b.input?.task_id ??
          b.input?.bash_id ??
          b.input?.id;
        if (typeof ref === "string") killed.add(ref);
      }
    }
  }

  // Second pass: every Bash-backgrounded start becomes a record (running, until a notification updates it).
  const byId = new Map<string, ShellRecord>();
  for (const row of rows) {
    const id = row?.toolUseResult?.backgroundTaskId;
    if (typeof id !== "string" || !id) continue;
    const content = row?.message?.content;
    const result = Array.isArray(content)
      ? content.find((b) => b?.type === "tool_result")
      : undefined;
    const tuid = result?.tool_use_id;
    const use = typeof tuid === "string" ? bashUses.get(tuid) : undefined;
    if (!use) continue; // not a Bash-originated background task → not a shell (subagent guard)
    const startMs = Date.parse(row?.timestamp);
    const tur = row.toolUseResult;
    const trigger: BackgroundShell["trigger"] = tur.assistantAutoBackgrounded
      ? "auto"
      : tur.backgroundedByUser
        ? "user"
        : "explicit";
    const rec: ShellRecord = {
      id,
      command: use.command,
      status: "running",
      trigger,
      outputFile: outputPathFromStart(result?.content),
    };
    if (use.description) rec.description = use.description;
    if (Number.isFinite(startMs)) rec.startMs = startMs;
    byId.set(id, rec);
  }

  // Third pass: completion notifications set completed/killed + exit code + duration, scoped to known ids.
  for (const row of rows) {
    if (row?.type !== "queue-operation") continue;
    const body = typeof row.content === "string" ? row.content : "";
    if (!body.includes("<task-notification>")) continue;
    const id = tag(body, "task-id");
    if (!id) continue;
    const rec = byId.get(id);
    if (!rec) continue; // a subagent's notification (id not a shell) is ignored
    const status = tag(body, "status");
    rec.status = status === "killed" ? "killed" : "completed";
    const out = tag(body, "output-file");
    if (out) rec.outputFile = out; // authoritative path
    const exit = tag(body, "summary")?.match(/\(exit code (\d+)\)/);
    if (exit) rec.exitCode = Number(exit[1]);
    const endMs = Date.parse(row?.timestamp);
    if (Number.isFinite(endMs) && rec.startMs !== undefined)
      rec.durationMs = endMs - rec.startMs;
  }

  // Fourth pass: a kill with no completion notification marks the shell killed.
  for (const [id, rec] of byId)
    if (rec.status === "running" && killed.has(id)) rec.status = "killed";

  return [...byId.values()].sort(
    (a, b) => (a.startMs ?? Infinity) - (b.startMs ?? Infinity),
  );
}
