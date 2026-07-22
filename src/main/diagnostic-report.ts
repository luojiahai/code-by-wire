import { createReadStream, statSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import type { AgentId } from "@shared/agents";
import type { CliStatus } from "@shared/cli-status";
import type { ModelUsage, Session, Usage } from "@shared/types";
import type { ManagedEntrySnapshot } from "./managed-registry";
import type { DiagnosticLogEntry } from "./log-buffer";
import { listSessionSubagentFiles } from "./provider/claude/subagents";

const PROCESS_SAMPLE_MS = 150;

const KNOWN_ENTRY_TYPES: Record<AgentId, ReadonlySet<string>> = {
  claude: new Set([
    "assistant",
    "custom-title",
    "file-history-snapshot",
    "last-prompt",
    "progress",
    "queue-operation",
    "summary",
    "system",
    "user",
  ]),
  codex: new Set([
    "compacted",
    "event_msg",
    "response_item",
    "session_meta",
    "turn_context",
  ]),
};

export interface TranscriptScanData {
  status: "ok";
  nonEmptyLines: number;
  parsedEntries: number;
  malformedInteriorLines: number;
  incompleteTrailingLine: boolean;
  entryTypes: Record<string, number>;
  /** Used only to scope Claude's shared flat subagent directory; never rendered. */
  referencedAgentIds: string[];
}

export type TranscriptScan =
  | TranscriptScanData
  | { status: "absent" }
  | { status: "error"; code: string };

export interface DiagnosticProcessMetric {
  pid: number;
  type: string;
  name?: string;
  cpuPercent: number;
  cumulativeCpuSeconds?: number;
  workingSetBytes: number;
  privateBytes?: number;
}

export interface AppMetricLike {
  pid: number;
  type: string;
  name?: string;
  cpu: { percentCPUUsage: number; cumulativeCPUUsage?: number };
  memory: { workingSetSize: number; privateBytes?: number };
}

export interface DiagnosticDeps {
  findSession(id: string): Session | undefined;
  cliStatus(agent: AgentId): CliStatus | null;
  configDir(agent: AgentId): string;
  versionFloor(agent: AgentId): string | null;
  resolveTranscriptPath(id: string): string | null;
  resolveSessionCwd(id: string): string | null;
  managedEntry(id: string): ManagedEntrySnapshot | undefined;
  appVersion(): string;
  appMetrics(): AppMetricLike[];
  delay(ms: number): Promise<void>;
  now(): number;
  homeDir(): string;
  cpuInfo(): Array<{ model: string }>;
  totalMemory(): number;
  freeMemory(): number;
  osRelease(): string;
  appUptimeSeconds(): number;
  processMemory(): NodeJS.MemoryUsage;
  processVersions(): Pick<
    NodeJS.ProcessVersions,
    "electron" | "chrome" | "node"
  >;
  platform: NodeJS.Platform;
  arch: string;
  recentLogs(): DiagnosticLogEntry[];
}

export interface DiagnosticData {
  generatedAt: string;
  homeDir: string;
  environment: {
    appVersion: string;
    electronVersion: string;
    chromeVersion: string;
    nodeVersion: string;
    platform: NodeJS.Platform;
    arch: string;
    osRelease: string;
  };
  system: {
    cpuModel: string | null;
    cpuCores: number;
    totalMemoryBytes: number;
    freeMemoryBytes: number;
    appUptimeSeconds: number;
    processSampleMs: number;
    processes: DiagnosticProcessMetric[] | null;
    mainMemory: NodeJS.MemoryUsage;
  };
  agent: {
    id: AgentId;
    cliKind: CliStatus["kind"] | "not-checked";
    cliVersion: string | null;
    minimumVersion: string | null;
    configDir: string;
  };
  session: {
    id: string;
    state: Session["state"];
    management: Session["management"];
    threadKind: Session["threadKind"];
    parentSessionId: string | undefined;
    resumable: boolean;
    model: Session["model"];
    modelId: string | undefined;
    modelDisplayName: string | undefined;
    effortLevel: string | undefined;
    contextPct: number;
    contextWindow: number;
    createdMs: number;
    lastActivityMs: number;
    sessionClockMs: number | undefined;
  };
  usage: Usage & {
    costUsd: number | undefined;
    linesAdded: number | undefined;
    linesRemoved: number | undefined;
    compactionCount: number;
    compactionTokensReclaimed: number;
    byModel: ModelUsage[];
  };
  files: {
    cwd: string | null;
    worktreePath: string | null;
    worktreeRepoRoot: string | null;
    branch: string | null;
    sourcePath: string | null;
    sourceSizeBytes: number | null;
    sourceMtimeMs: number | null;
    sourceStatError: string | null;
    subagentFileCount: number | null;
  };
  transcriptScan: TranscriptScan;
  managedProcess: {
    pid: number;
    spawnedAtMs: number;
    claimedRollout: string | null;
  } | null;
  recentLogs: DiagnosticLogEntry[];
}

function collectAgentIds(value: unknown, out: Set<string>): void {
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (Array.isArray(current)) {
      for (const item of current) pending.push(item as unknown);
      continue;
    }
    if (!current || typeof current !== "object") continue;
    for (const [key, nested] of Object.entries(
      current as Record<string, unknown>,
    )) {
      if (key === "agentId" && typeof nested === "string" && nested.trim())
        out.add(nested);
      if (nested && typeof nested === "object") pending.push(nested);
    }
  }
}

/** Stream-count a provider JSONL without retaining any row or content. A failed final unterminated
 *  record is separated from real malformed interior lines because live transcripts are append-only. */
export async function scanTranscriptFile(
  path: string,
  agent: AgentId,
): Promise<TranscriptScanData> {
  const result: TranscriptScanData = {
    status: "ok",
    nonEmptyLines: 0,
    parsedEntries: 0,
    malformedInteriorLines: 0,
    incompleteTrailingLine: false,
    entryTypes: {},
    referencedAgentIds: [],
  };
  const referenced = new Set<string>();
  const known = KNOWN_ENTRY_TYPES[agent];

  const processLine = (raw: string, terminated: boolean): void => {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const trimmed = line.trim();
    if (!trimmed) return;
    result.nonEmptyLines++;
    try {
      const row: unknown = JSON.parse(trimmed);
      result.parsedEntries++;
      const record =
        row && typeof row === "object" && !Array.isArray(row)
          ? (row as Record<string, unknown>)
          : null;
      const rawType = record?.type;
      const type =
        typeof rawType === "string" && known.has(rawType) ? rawType : "other";
      result.entryTypes[type] = (result.entryTypes[type] ?? 0) + 1;
      if (agent === "claude") collectAgentIds(row, referenced);
    } catch {
      if (terminated) result.malformedInteriorLines++;
      else result.incompleteTrailingLine = true;
    }
  };

  const decoder = new StringDecoder("utf8");
  let carry = "";
  for await (const chunk of createReadStream(path)) {
    carry += decoder.write(chunk as Buffer);
    let newline = carry.indexOf("\n");
    while (newline !== -1) {
      processLine(carry.slice(0, newline), true);
      carry = carry.slice(newline + 1);
      newline = carry.indexOf("\n");
    }
  }
  carry += decoder.end();
  if (carry.length > 0) processLine(carry, false);
  result.referencedAgentIds = [...referenced].sort();
  result.entryTypes = Object.fromEntries(
    Object.entries(result.entryTypes).sort(([a], [b]) => a.localeCompare(b)),
  );
  return result;
}

function safeErrorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(code)
    ? code
    : "unknown";
}

async function inspectSource(
  session: Session,
  deps: DiagnosticDeps,
): Promise<{
  path: string | null;
  sizeBytes: number | null;
  mtimeMs: number | null;
  statError: string | null;
  scan: TranscriptScan;
  subagentFileCount: number | null;
}> {
  const path = deps.resolveTranscriptPath(session.id);
  if (!path)
    return {
      path: null,
      sizeBytes: null,
      mtimeMs: null,
      statError: null,
      scan: { status: "absent" },
      subagentFileCount: session.agent === "claude" ? 0 : null,
    };

  let sizeBytes: number | null = null;
  let mtimeMs: number | null = null;
  let statError: string | null = null;
  try {
    const stat = statSync(path);
    sizeBytes = stat.size;
    mtimeMs = stat.mtimeMs;
  } catch (error) {
    statError = safeErrorCode(error);
  }

  let scan: TranscriptScan;
  try {
    scan = await scanTranscriptFile(path, session.agent);
  } catch (error) {
    scan = { status: "error", code: safeErrorCode(error) };
  }

  let subagentFileCount: number | null = null;
  if (session.agent === "claude") {
    const ids =
      scan.status === "ok"
        ? new Set(scan.referencedAgentIds)
        : new Set<string>();
    subagentFileCount = listSessionSubagentFiles(
      path,
      session.id,
      () => ids,
    ).length;
  }
  return { path, sizeBytes, mtimeMs, statError, scan, subagentFileCount };
}

async function sampleProcesses(
  deps: DiagnosticDeps,
): Promise<DiagnosticProcessMetric[] | null> {
  try {
    deps.appMetrics();
    await deps.delay(PROCESS_SAMPLE_MS);
    return deps
      .appMetrics()
      .filter((metric) => ["Browser", "Tab", "GPU"].includes(metric.type))
      .map((metric) => ({
        pid: metric.pid,
        type: metric.type,
        name: metric.name,
        cpuPercent: metric.cpu.percentCPUUsage,
        cumulativeCpuSeconds: metric.cpu.cumulativeCPUUsage,
        // Electron MemoryInfo values are KiB.
        workingSetBytes: metric.memory.workingSetSize * 1024,
        privateBytes:
          metric.memory.privateBytes === undefined
            ? undefined
            : metric.memory.privateBytes * 1024,
      }));
  } catch {
    return null;
  }
}

export async function gatherDiagnostics(
  sessionId: string,
  deps: DiagnosticDeps,
): Promise<DiagnosticData | null> {
  const session = deps.findSession(sessionId);
  if (!session) return null;
  const generatedAtMs = deps.now();
  const versions = deps.processVersions();
  const cli = deps.cliStatus(session.agent);
  const managed = deps.managedEntry(session.id);
  const cpus = deps.cpuInfo();
  const [processes, source] = await Promise.all([
    sampleProcesses(deps),
    inspectSource(session, deps),
  ]);
  const cwd = session.cwd || deps.resolveSessionCwd(session.id);

  return {
    generatedAt: new Date(generatedAtMs).toISOString(),
    homeDir: deps.homeDir(),
    environment: {
      appVersion: deps.appVersion(),
      electronVersion: versions.electron ?? "unknown",
      chromeVersion: versions.chrome ?? "unknown",
      nodeVersion: versions.node,
      platform: deps.platform,
      arch: deps.arch,
      osRelease: deps.osRelease(),
    },
    system: {
      cpuModel: cpus.find((cpu) => cpu.model.trim())?.model ?? null,
      cpuCores: cpus.length,
      totalMemoryBytes: deps.totalMemory(),
      freeMemoryBytes: deps.freeMemory(),
      appUptimeSeconds: deps.appUptimeSeconds(),
      processSampleMs: PROCESS_SAMPLE_MS,
      processes,
      mainMemory: deps.processMemory(),
    },
    agent: {
      id: session.agent,
      cliKind: cli?.kind ?? "not-checked",
      cliVersion: cli?.version ?? null,
      minimumVersion: cli?.floor ?? deps.versionFloor(session.agent),
      configDir: cli?.configDir.active ?? deps.configDir(session.agent),
    },
    session: {
      id: session.id,
      state: session.state,
      management: session.management,
      threadKind: session.threadKind,
      parentSessionId: session.parentSessionId,
      resumable: session.resumable,
      model: session.model,
      modelId: session.modelId ?? session.modelRaw,
      modelDisplayName: session.modelDisplayName,
      effortLevel: session.effortLevel,
      contextPct: session.contextPct,
      contextWindow: session.contextWindow,
      createdMs: session.createdMs,
      lastActivityMs: session.lastActivityMs,
      sessionClockMs: session.sessionClockMs,
    },
    usage: {
      ...session.usage,
      costUsd: session.costUsd,
      linesAdded: session.linesAdded,
      linesRemoved: session.linesRemoved,
      compactionCount: session.compactionCount ?? 0,
      compactionTokensReclaimed: session.compactionTokensReclaimed ?? 0,
      byModel: session.usageByModel ?? [],
    },
    files: {
      cwd,
      worktreePath: session.worktree ? cwd : null,
      worktreeRepoRoot: session.worktree?.repoRoot ?? null,
      branch: session.branch ?? null,
      sourcePath: source.path,
      sourceSizeBytes: source.sizeBytes,
      sourceMtimeMs: source.mtimeMs,
      sourceStatError: source.statError,
      subagentFileCount: source.subagentFileCount,
    },
    transcriptScan: source.scan,
    managedProcess: managed
      ? {
          pid: managed.pid,
          spawnedAtMs: managed.spawnedAtMs,
          claimedRollout: managed.claimedRollout ?? null,
        }
      : null,
    recentLogs: deps.recentLogs(),
  };
}

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replace every path-form occurrence of the active home directory. Windows matching is
 *  case-insensitive and recognizes either slash style so reports remain safe across CI platforms. */
export function redactHome(value: string, homeDir: string): string {
  if (!homeDir) return value;
  const windows =
    /^[A-Za-z]:[\\/]/.test(homeDir) ||
    /^[\\/]{2}[^\\/]+[\\/][^\\/]+/.test(homeDir);
  const variants = new Set([
    homeDir.replace(/[\\/]+$/, ""),
    homeDir.replace(/\\/g, "/").replace(/\/+$/, ""),
    homeDir.replace(/\//g, "\\").replace(/\\+$/, ""),
  ]);
  let out = value;
  for (const home of [...variants]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)) {
    out = out.replace(
      new RegExp(`${escapeRegex(home)}(?=$|[\\\\/])`, windows ? "gi" : "g"),
      "~",
    );
  }
  return out;
}

function normalizeScalar(value: string, homeDir: string): string {
  const escaped = redactHome(value, homeDir)
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
  let normalized = "";
  for (const character of escaped) {
    const codePoint = character.codePointAt(0) ?? 0;
    normalized += codePoint < 0x20 || codePoint === 0x7f ? "�" : character;
  }
  return normalized;
}

function code(
  value: string | number | boolean | null | undefined,
  homeDir: string,
): string {
  if (value === null || value === undefined || value === "") return "`n/a`";
  const normalized = normalizeScalar(String(value), homeDir);
  const longest = Math.max(
    0,
    ...(normalized.match(/`+/g) ?? []).map((run) => run.length),
  );
  const fence = "`".repeat(longest + 1);
  const pad = normalized.startsWith("`") || normalized.endsWith("`") ? " " : "";
  return `${fence}${pad}${normalized}${pad}${fence}`;
}

const number = (value: number | undefined | null): string =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "n/a"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
        value,
      );

const bytes = (value: number | undefined | null): string =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "n/a"
    : `${(value / 1024 / 1024).toFixed(2)} MiB`;

const iso = (value: number | undefined | null): string =>
  value === null || value === undefined || value <= 0
    ? "n/a"
    : new Date(value).toISOString();

const bullet = (label: string, value: string): string =>
  `- **${label}:** ${value}`;

function usageLines(usage: Usage): string[] {
  return [
    bullet("Input tokens", number(usage.inputTokens)),
    bullet("Output tokens", number(usage.outputTokens)),
    bullet("Cache read tokens", number(usage.cacheReadTokens)),
    bullet("Cache write tokens", number(usage.cacheCreationTokens)),
    bullet("Cache write (5m)", number(usage.cacheCreation5mTokens)),
    bullet("Cache write (1h)", number(usage.cacheCreation1hTokens)),
  ];
}

export function renderDiagnosticReport(data: DiagnosticData): string {
  const h = data.homeDir;
  const lines: string[] = [
    "# Code-by-wire diagnostic report",
    "",
    "## Environment",
    "",
    bullet("Generated at", code(data.generatedAt, h)),
    bullet("App version", code(data.environment.appVersion, h)),
    bullet("Electron", code(data.environment.electronVersion, h)),
    bullet("Chrome", code(data.environment.chromeVersion, h)),
    bullet("Node", code(data.environment.nodeVersion, h)),
    bullet("Platform", code(data.environment.platform, h)),
    bullet("Architecture", code(data.environment.arch, h)),
    bullet("OS release", code(data.environment.osRelease, h)),
    "",
    "## System",
    "",
    bullet("CPU", code(data.system.cpuModel, h)),
    bullet("Logical cores", number(data.system.cpuCores)),
    bullet("Total RAM", bytes(data.system.totalMemoryBytes)),
    bullet("Free RAM (snapshot)", bytes(data.system.freeMemoryBytes)),
    bullet("App uptime", `${number(data.system.appUptimeSeconds)} s`),
    bullet("Process CPU sample", `${data.system.processSampleMs} ms`),
    bullet("Main RSS", bytes(data.system.mainMemory.rss)),
    bullet("Main heap used", bytes(data.system.mainMemory.heapUsed)),
    bullet("Main heap total", bytes(data.system.mainMemory.heapTotal)),
    bullet("Main external", bytes(data.system.mainMemory.external)),
    bullet("Main array buffers", bytes(data.system.mainMemory.arrayBuffers)),
    "",
    "### App processes (snapshot)",
    "",
  ];

  if (!data.system.processes) lines.push("- Metrics unavailable.");
  else if (data.system.processes.length === 0)
    lines.push("- No Browser/Tab/GPU processes reported.");
  else
    for (const process of data.system.processes) {
      lines.push(
        `- ${code(process.type, h)} pid ${code(process.pid, h)}${process.name ? ` (${code(process.name, h)})` : ""}: ${number(process.cpuPercent)}% CPU, ${bytes(process.workingSetBytes)} working set${process.privateBytes === undefined ? "" : `, ${bytes(process.privateBytes)} private`}${process.cumulativeCpuSeconds === undefined ? "" : `, ${number(process.cumulativeCpuSeconds)} s cumulative CPU`}`,
      );
    }

  lines.push(
    "",
    "## Agent",
    "",
    bullet("Agent", code(data.agent.id, h)),
    bullet("CLI status", code(data.agent.cliKind, h)),
    bullet("Detected version", code(data.agent.cliVersion, h)),
    bullet("Minimum version", code(data.agent.minimumVersion, h)),
    bullet("Config directory", code(data.agent.configDir, h)),
    "",
    "## Session",
    "",
    bullet("ID", code(data.session.id, h)),
    bullet("State", code(data.session.state, h)),
    bullet("Management", code(data.session.management, h)),
    bullet("Thread kind", code(data.session.threadKind ?? "root", h)),
    bullet("Parent session ID", code(data.session.parentSessionId, h)),
    bullet("Resumable", code(data.session.resumable, h)),
    bullet("Model family", code(data.session.model, h)),
    bullet("Model ID", code(data.session.modelId, h)),
    bullet("Model display name", code(data.session.modelDisplayName, h)),
    bullet("Effort", code(data.session.effortLevel, h)),
    bullet(
      "Context",
      `${number(data.session.contextPct)}% of ${number(data.session.contextWindow)} tokens`,
    ),
    bullet("Created", code(iso(data.session.createdMs), h)),
    bullet("Last activity", code(iso(data.session.lastActivityMs), h)),
    bullet(
      "Session clock",
      data.session.sessionClockMs === undefined
        ? "`n/a`"
        : `${number(data.session.sessionClockMs)} ms`,
    ),
    "",
    "## Usage",
    "",
    ...usageLines(data.usage),
    bullet(
      "Cost",
      data.usage.costUsd === undefined
        ? "`n/a`"
        : `$${data.usage.costUsd.toFixed(6)}`,
    ),
    bullet("Lines added", number(data.usage.linesAdded)),
    bullet("Lines removed", number(data.usage.linesRemoved)),
    bullet("Compactions", number(data.usage.compactionCount)),
    bullet(
      "Compaction tokens reclaimed",
      number(data.usage.compactionTokensReclaimed),
    ),
    "",
    "### Usage by model",
    "",
  );
  if (data.usage.byModel.length === 0)
    lines.push("- No per-model usage reported.");
  else
    for (const model of data.usage.byModel) {
      lines.push(`- ${code(model.modelRaw ?? "unreported", h)}`);
      lines.push(...usageLines(model.usage).map((line) => `  ${line}`));
    }

  lines.push(
    "",
    "## Files",
    "",
    bullet("Working directory", code(data.files.cwd, h)),
    bullet("Worktree path", code(data.files.worktreePath, h)),
    bullet("Main checkout", code(data.files.worktreeRepoRoot, h)),
    bullet("Branch", code(data.files.branch, h)),
    bullet(
      data.agent.id === "claude" ? "Transcript path" : "Rollout path",
      code(data.files.sourcePath, h),
    ),
    bullet("Source size", bytes(data.files.sourceSizeBytes)),
    bullet("Source modified", code(iso(data.files.sourceMtimeMs), h)),
    bullet("Source stat error", code(data.files.sourceStatError, h)),
    bullet(
      "Subagent files",
      data.files.subagentFileCount === null
        ? "`n/a`"
        : number(data.files.subagentFileCount),
    ),
    "",
    "## Transcript scan",
    "",
  );

  if (data.transcriptScan.status === "absent")
    lines.push("- Source file absent.");
  else if (data.transcriptScan.status === "error")
    lines.push(bullet("Scan error", code(data.transcriptScan.code, h)));
  else {
    lines.push(
      bullet("Non-empty lines", number(data.transcriptScan.nonEmptyLines)),
      bullet("Parsed entries", number(data.transcriptScan.parsedEntries)),
      bullet(
        "Malformed interior lines",
        number(data.transcriptScan.malformedInteriorLines),
      ),
      bullet(
        "Incomplete trailing line",
        code(data.transcriptScan.incompleteTrailingLine, h),
      ),
      "",
      "### Entries by type",
      "",
    );
    const types = Object.entries(data.transcriptScan.entryTypes);
    if (types.length === 0) lines.push("- No parsed entries.");
    else
      for (const [type, count] of types)
        lines.push(`- ${code(type, h)}: ${number(count)}`);
  }

  lines.push("", "## Managed process", "");
  if (!data.managedProcess) lines.push("- Not managed by this app run.");
  else
    lines.push(
      bullet("PID", code(data.managedProcess.pid, h)),
      bullet("Spawned at", code(iso(data.managedProcess.spawnedAtMs), h)),
      bullet("Claimed rollout", code(data.managedProcess.claimedRollout, h)),
    );

  lines.push(
    "",
    "## Recent logs",
    "",
    "Structured event metadata only; raw console arguments and error messages are not retained.",
    "",
  );
  if (data.recentLogs.length === 0)
    lines.push("- No buffered warnings or errors.");
  else
    for (const entry of data.recentLogs) {
      const detail = [entry.errorName, entry.errorCode]
        .filter(Boolean)
        .join("/");
      lines.push(
        `- ${code(iso(entry.ts), h)} ${code(entry.level, h)} ${code(entry.event, h)}${detail ? ` (${code(detail, h)})` : ""}`,
      );
    }

  lines.push(
    "",
    "---",
    "",
    "*This report contains no message content, code, or file contents.*",
    "",
  );
  return lines.join("\n");
}

export function diagnosticFileName(data: DiagnosticData): string {
  const id =
    data.session.id.replace(/[^A-Za-z0-9-]/g, "").slice(0, 8) || "session";
  const day = data.generatedAt.slice(0, 10).replace(/-/g, "");
  return `code-by-wire-diagnostic-${data.agent.id}-${id}-${day}.md`;
}
