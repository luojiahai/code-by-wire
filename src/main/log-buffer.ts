export type DiagnosticLogLevel = "error" | "warn";

export interface DiagnosticLogEntry {
  ts: number;
  level: DiagnosticLogLevel;
  event: string;
  errorName?: string;
  errorCode?: string;
}

interface ConsoleSink {
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
}

const TOKEN_RE = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

function safeToken(value: unknown, pattern: RegExp): string | undefined {
  return typeof value === "string" && pattern.test(value) ? value : undefined;
}

function errorFields(
  args: unknown[],
): Pick<DiagnosticLogEntry, "errorName" | "errorCode"> {
  for (const value of args) {
    if (!value || typeof value !== "object") continue;
    const candidate = value as { name?: unknown; code?: unknown };
    const errorCode = safeToken(candidate.code, CODE_RE);
    const rawName = safeToken(candidate.name, TOKEN_RE);
    const errorName = value instanceof Error ? (rawName ?? "Error") : rawName;
    if (errorName || errorCode) return { errorName, errorCode };
  }
  return {};
}

/** A small injectable structured logger. The ring stores only explicitly-safe tokens; console output
 *  still receives the caller's original arguments byte-for-byte. */
export function createLogBuffer({
  capacity = 200,
  now = Date.now,
  sink = console,
}: {
  capacity?: number;
  now?: () => number;
  sink?: ConsoleSink;
} = {}) {
  const entries: DiagnosticLogEntry[] = [];

  const append = (
    level: DiagnosticLogLevel,
    event: string,
    args: unknown[],
  ): void => {
    const safeEvent = safeToken(event, TOKEN_RE) ?? "unknown-event";
    entries.push({ ts: now(), level, event: safeEvent, ...errorFields(args) });
    if (entries.length > Math.max(0, capacity))
      entries.splice(0, entries.length - Math.max(0, capacity));
  };

  return {
    error(event: string, ...args: unknown[]): void {
      append("error", event, args);
      sink.error(...args);
    },
    warn(event: string, ...args: unknown[]): void {
      append("warn", event, args);
      sink.warn(...args);
    },
    recent(): DiagnosticLogEntry[] {
      return entries.map((entry) => ({ ...entry }));
    },
  };
}

const mainLog = createLogBuffer();

export const logError = (event: string, ...args: unknown[]): void =>
  mainLog.error(event, ...args);

export const logWarn = (event: string, ...args: unknown[]): void =>
  mainLog.warn(event, ...args);

export const recentLogs = (): DiagnosticLogEntry[] => mainLog.recent();
