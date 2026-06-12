import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Task } from "@shared/types";
import { newestMtime } from "./dir-mtime";

/** A task file's only fields we care about; the store also writes `description`, `activeForm`, `blocks`. */
interface RawTask {
  id: string;
  subject: string;
  status: string;
  blockedBy: string[];
}

/** Only numbered task files are data; `.lock` / `.highwatermark` are store bookkeeping. */
const TASK_FILE = /^\d+\.json$/;

function deriveStatus(
  t: RawTask,
  completed: Set<string>,
  present: Set<string>,
): Task["status"] {
  if (t.status === "completed") return "completed";
  if (t.status === "in_progress") return "in_progress";
  // pending (or anything unexpected): blocked iff a real dependency isn't done yet. A dep that isn't in
  // this session's task set (deleted/renumbered) can't block — ignore it rather than latch 'blocked'.
  if (t.blockedBy.some((dep) => present.has(dep) && !completed.has(dep)))
    return "blocked";
  return "pending";
}

/**
 * Read one session's task list from `<claudeDir>/tasks/<sessionId>/`, in numeric id order. Maps each
 * store file to a `Task`, deriving the `blocked` status (the store only writes pending/in_progress/
 * completed). A missing dir or a malformed file is skipped, never fatal.
 */
export function readTasksForSession(
  claudeDir: string,
  sessionId: string,
): Task[] {
  const dir = join(claudeDir, "tasks", sessionId);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }

  const raw: RawTask[] = [];
  for (const name of names) {
    if (!TASK_FILE.test(name)) continue;
    try {
      const j = JSON.parse(readFileSync(join(dir, name), "utf8"));
      if (
        typeof j.id === "string" &&
        typeof j.subject === "string" &&
        typeof j.status === "string"
      ) {
        raw.push({
          id: j.id,
          subject: j.subject,
          status: j.status,
          blockedBy: Array.isArray(j.blockedBy)
            ? j.blockedBy.filter((x: unknown) => typeof x === "string")
            : [],
        });
      }
    } catch {
      // skip a malformed task file
    }
  }

  // Numeric order, but tolerant of a non-numeric id: localeCompare's numeric mode sorts '2' before '10'
  // without the NaN comparator a `Number(a.id) - Number(b.id)` subtraction would yield on a bad id.
  raw.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const completed = new Set(
    raw.filter((t) => t.status === "completed").map((t) => t.id),
  );
  const present = new Set(raw.map((t) => t.id));
  return raw.map((t) => {
    const task: Task = {
      id: t.id,
      subject: t.subject,
      status: deriveStatus(t, completed, present),
    };
    if (t.blockedBy.length) task.blockedBy = t.blockedBy;
    return task;
  });
}

/** Newest mtime (ms) among a session's numbered task files, or 0 when the dir is absent/empty. The
 *  `readTasks` change token: rewriting any task file (add or status change) advances it. */
export function tasksNewestMtime(claudeDir: string, sessionId: string): number {
  return newestMtime(join(claudeDir, "tasks", sessionId), (name) =>
    TASK_FILE.test(name),
  );
}
