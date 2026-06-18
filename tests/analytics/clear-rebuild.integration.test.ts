import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { scanAllTranscripts } from "../../src/main/analytics/scan";
import {
  migrateAnalytics,
  readTotals,
  clearAnalytics,
} from "../../src/main/db/analytics";
import { openTestDb } from "../helpers/sqlite";
import { tempHomes } from "../helpers/temp-home";

const makeHome = tempHomes("cbw-clear-rebuild-");
const ANCIENT = 1_000_000_000_000;

function writeTranscript(
  home: string,
  proj: string,
  id: string,
  lines: unknown[],
  mtimeMs: number,
): void {
  const dir = join(home, "projects", proj);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${id}.jsonl`);
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  utimesSync(path, new Date(mtimeMs), new Date(mtimeMs));
}

const assistantLine = (id: string, model: string, input: number) => ({
  type: "assistant",
  cwd: "/work/proj",
  gitBranch: "main",
  timestamp: "2020-01-01T00:00:00.000Z",
  message: {
    role: "assistant",
    id,
    model,
    usage: {
      input_tokens: input,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  },
});

describe("clear then re-scan rebuilds identical totals", () => {
  it("repopulates turns from the transcripts after a clear", () => {
    const home = makeHome();
    writeTranscript(
      home,
      "-work-proj",
      "sess-1",
      [
        assistantLine("a-1", "claude-opus-4-8", 100),
        assistantLine("a-2", "claude-sonnet-4-6", 200),
      ],
      ANCIENT,
    );

    const db = openTestDb();
    migrateAnalytics(db);
    scanAllTranscripts(db, home);
    const before = readTotals(db);
    expect(before.turns).toBe(2);
    expect(before.inputTokens).toBe(300);

    clearAnalytics(db);
    expect(readTotals(db).turns).toBe(0); // store is empty after the clear

    // The high-water marks were cleared, so a full re-scan re-ingests every line from zero.
    scanAllTranscripts(db, home);
    expect(readTotals(db)).toEqual(before); // identical totals, rebuilt from disk
  });
});
