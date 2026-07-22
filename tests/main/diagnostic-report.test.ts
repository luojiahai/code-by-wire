import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Session } from "@shared/types";
import {
  diagnosticFileName,
  gatherDiagnostics,
  redactHome,
  renderDiagnosticReport,
  scanTranscriptFile,
  type DiagnosticData,
  type DiagnosticDeps,
} from "../../src/main/diagnostic-report";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

const zeroUsage = {
  inputTokens: 1,
  outputTokens: 2,
  cacheReadTokens: 3,
  cacheCreationTokens: 4,
  cacheCreation5mTokens: 4,
  cacheCreation1hTokens: 0,
};

function fixtureData(): DiagnosticData {
  return {
    generatedAt: "2026-07-22T01:02:03.000Z",
    homeDir: "/Users/alice",
    environment: {
      appVersion: "0.1.43",
      electronVersion: "41.7.2",
      chromeVersion: "142",
      nodeVersion: "24.0.0",
      platform: "darwin",
      arch: "arm64",
      osRelease: "25.0.0",
    },
    system: {
      cpuModel: "Test CPU",
      cpuCores: 8,
      totalMemoryBytes: 16 * 1024 ** 3,
      freeMemoryBytes: 8 * 1024 ** 3,
      appUptimeSeconds: 12,
      processSampleMs: 150,
      processes: [
        {
          pid: 10,
          type: "Browser",
          cpuPercent: 1.5,
          workingSetBytes: 20 * 1024 ** 2,
        },
      ],
      mainMemory: {
        rss: 1,
        heapTotal: 2,
        heapUsed: 3,
        external: 4,
        arrayBuffers: 5,
      },
    },
    agent: {
      id: "claude",
      cliKind: "ready",
      cliVersion: "2.1.177",
      minimumVersion: "2.1.177",
      configDir: "/Users/alice/.claude",
    },
    session: {
      id: "12345678-aaaa",
      state: "idle",
      management: "managed",
      threadKind: undefined,
      parentSessionId: undefined,
      resumable: true,
      model: "opus",
      modelId: "model|with`marks",
      modelDisplayName: "Opus",
      effortLevel: "high",
      contextPct: 42,
      contextWindow: 200_000,
      createdMs: Date.UTC(2026, 6, 22),
      lastActivityMs: Date.UTC(2026, 6, 22, 1),
      sessionClockMs: 5000,
    },
    usage: {
      ...zeroUsage,
      costUsd: 1.25,
      linesAdded: 10,
      linesRemoved: 2,
      compactionCount: 1,
      compactionTokensReclaimed: 100,
      byModel: [{ modelRaw: "raw-model", usage: zeroUsage }],
    },
    files: {
      cwd: "/Users/alice/project",
      worktreePath: "/Users/alice/project",
      worktreeRepoRoot: "/Users/alice/repo",
      branch: "feature/report",
      sourcePath: "/Users/alice/.claude/projects/p/123.jsonl",
      sourceSizeBytes: 1024,
      sourceMtimeMs: Date.UTC(2026, 6, 22, 1),
      sourceStatError: null,
      subagentFileCount: 2,
    },
    transcriptScan: {
      status: "ok",
      nonEmptyLines: 4,
      parsedEntries: 3,
      malformedInteriorLines: 1,
      incompleteTrailingLine: false,
      entryTypes: { assistant: 1, other: 1, user: 1 },
      referencedAgentIds: [],
    },
    managedProcess: {
      pid: 10,
      spawnedAtMs: Date.UTC(2026, 6, 22),
      claimedRollout: null,
    },
    recentLogs: [
      {
        ts: Date.UTC(2026, 6, 22),
        level: "error",
        event: "stats-read-failed",
        errorName: "Error",
        errorCode: "SQLITE_CORRUPT",
      },
    ],
  };
}

describe("renderDiagnosticReport", () => {
  it("renders every diagnostic section, redacts home, and keeps the privacy footer", () => {
    const report = renderDiagnosticReport(fixtureData());
    for (const heading of [
      "## Environment",
      "## System",
      "## Agent",
      "## Session",
      "## Usage",
      "## Files",
      "## Transcript scan",
      "## Managed process",
      "## Recent logs",
    ])
      expect(report).toContain(heading);
    expect(report).toContain("~/.claude");
    expect(report).not.toContain("/Users/alice");
    expect(report).toContain(
      "*This report contains no message content, code, or file contents.*",
    );
  });

  it("cannot include content-derived fields because DiagnosticData contains only explicit metadata", () => {
    const report = renderDiagnosticReport(fixtureData());
    for (const secret of [
      "SECRET_SESSION_TITLE",
      "SECRET_CURRENT_TASK",
      "SECRET_WAITING_REASON",
      "SECRET_RAW_ERROR_MESSAGE",
      "SECRET_TRANSCRIPT_CONTENT",
    ])
      expect(report).not.toContain(secret);
  });

  it("builds the stable default filename", () => {
    expect(diagnosticFileName(fixtureData())).toBe(
      "code-by-wire-diagnostic-claude-12345678-20260722.md",
    );
  });
});

describe("redactHome", () => {
  it("redacts macOS paths without matching a longer sibling username", () => {
    expect(
      redactHome("/Users/alice/project /Users/alice2/project", "/Users/alice"),
    ).toBe("~/project /Users/alice2/project");
  });

  it("redacts Windows paths case-insensitively with either slash style", () => {
    expect(
      redactHome(
        "C:\\Users\\Alice\\one c:/users/alice/two C:\\Users\\Alice2\\three",
        "C:\\Users\\Alice",
      ),
    ).toBe("~\\one ~/two C:\\Users\\Alice2\\three");
  });
});

describe("scanTranscriptFile", () => {
  it("separates malformed interior and incomplete trailing records", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cbw-diagnostic-"));
    dirs.push(dir);
    const path = join(dir, "session.jsonl");
    writeFileSync(
      path,
      [
        '{"type":"user","agentId":"a-1"}',
        "malformed",
        '{"type":"unexpected"}',
        '{"type":"assistant"}',
      ].join("\r\n") + '\r\n{"type":"system"',
    );
    await expect(scanTranscriptFile(path, "claude")).resolves.toEqual({
      status: "ok",
      nonEmptyLines: 5,
      parsedEntries: 3,
      malformedInteriorLines: 1,
      incompleteTrailingLine: true,
      entryTypes: { assistant: 1, other: 1, user: 1 },
      referencedAgentIds: ["a-1"],
    });
  });

  it("accepts a valid final record without a newline", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cbw-diagnostic-"));
    dirs.push(dir);
    const path = join(dir, "session.jsonl");
    writeFileSync(path, '{"type":"event_msg"}');
    const scan = await scanTranscriptFile(path, "codex");
    expect(scan).toMatchObject({
      parsedEntries: 1,
      malformedInteriorLines: 0,
      incompleteTrailingLine: false,
      entryTypes: { event_msg: 1 },
    });
  });
});

describe("gatherDiagnostics", () => {
  it("primes app metrics, waits 150ms, and uses the second snapshot", async () => {
    const session: Session = {
      id: "session",
      title: "SECRET_SESSION_TITLE",
      project: "project",
      state: "idle",
      management: "observed",
      agent: "claude",
      resumable: false,
      model: "opus",
      contextPct: 0,
      contextWindow: 200_000,
      usage: zeroUsage,
      lastActivityMs: 1,
      createdMs: 1,
      currentTask: "SECRET_CURRENT_TASK",
      waitingReason: "SECRET_WAITING_REASON",
    };
    const appMetrics = vi
      .fn<DiagnosticDeps["appMetrics"]>()
      .mockReturnValueOnce([])
      .mockReturnValueOnce([
        {
          pid: 1,
          type: "Browser",
          cpu: { percentCPUUsage: 7 },
          memory: { workingSetSize: 2 },
        },
      ]);
    const delay = vi.fn(async () => {});
    const deps: DiagnosticDeps = {
      findSession: () => session,
      cliStatus: () => null,
      configDir: () => "/config",
      versionFloor: () => "1.0.0",
      resolveTranscriptPath: () => null,
      resolveSessionCwd: () => null,
      managedEntry: () => undefined,
      appVersion: () => "1",
      appMetrics,
      delay,
      now: () => 1,
      homeDir: () => "/home/user",
      cpuInfo: () => [],
      totalMemory: () => 1,
      freeMemory: () => 1,
      osRelease: () => "release",
      appUptimeSeconds: () => 1,
      processMemory: () => ({
        rss: 1,
        heapTotal: 1,
        heapUsed: 1,
        external: 1,
        arrayBuffers: 1,
      }),
      processVersions: () => ({ electron: "1", chrome: "1", node: "1" }),
      platform: "darwin",
      arch: "arm64",
      recentLogs: () => [],
    };
    const data = await gatherDiagnostics("session", deps);
    expect(appMetrics).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledWith(150);
    expect(data?.system.processes?.[0]).toMatchObject({
      cpuPercent: 7,
      workingSetBytes: 2048,
    });
    expect(data).not.toHaveProperty("session.title");
  });
});
