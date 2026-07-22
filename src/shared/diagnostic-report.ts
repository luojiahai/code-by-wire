/** Stable failures crossing the diagnostic-report IPC boundary. Raw filesystem/error text stays in
 *  main and can neither leak into the renderer nor become untranslated UI copy. */
export type DiagnosticReportError = "not-found" | "generate-failed";

export type DiagnosticReportResult =
  | { ok: true; fileName: string; markdown: string }
  | { ok: false; error: DiagnosticReportError };

export type SaveDiagnosticReportResult =
  | { ok: true; status: "saved" | "canceled" }
  | { ok: false; error: "save-failed" };

/** A defensive IPC ceiling. Generated reports are normally tens of KiB even with a full log ring. */
export const MAX_DIAGNOSTIC_REPORT_BYTES = 1024 * 1024;
