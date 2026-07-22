import { writeFile } from "node:fs/promises";
import {
  MAX_DIAGNOSTIC_REPORT_BYTES,
  type SaveDiagnosticReportResult,
} from "@shared/diagnostic-report";

export interface DiagnosticSaveDialogOptions {
  defaultPath: string;
  filters: Array<{ name: string; extensions: string[] }>;
}

export interface DiagnosticSaveDeps {
  showSaveDialog(
    options: DiagnosticSaveDialogOptions,
  ): Promise<{ canceled: boolean; filePath?: string }>;
  write(path: string, markdown: string): Promise<void>;
}

export function sanitizeDiagnosticFileName(fileName: unknown): string {
  if (typeof fileName !== "string") return "code-by-wire-diagnostic.md";
  const leaf = fileName.split(/[\\/]/).pop()?.trim() ?? "";
  const printable = [...leaf]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= 0x20 && codePoint !== 0x7f;
    })
    .join("");
  const safe = printable
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 180);
  if (!safe || safe === "." || safe === "..")
    return "code-by-wire-diagnostic.md";
  return safe.toLowerCase().endsWith(".md") ? safe : `${safe}.md`;
}

export async function saveDiagnosticReport(
  request: { fileName: unknown; markdown: unknown },
  deps: DiagnosticSaveDeps = {
    showSaveDialog: () => Promise.resolve({ canceled: true }),
    write: (path, markdown) => writeFile(path, markdown, "utf8"),
  },
): Promise<SaveDiagnosticReportResult> {
  if (
    typeof request.markdown !== "string" ||
    Buffer.byteLength(request.markdown, "utf8") > MAX_DIAGNOSTIC_REPORT_BYTES
  )
    return { ok: false, error: "save-failed" };

  try {
    const result = await deps.showSaveDialog({
      defaultPath: sanitizeDiagnosticFileName(request.fileName),
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (result.canceled || !result.filePath)
      return { ok: true, status: "canceled" };
    await deps.write(result.filePath, request.markdown);
    return { ok: true, status: "saved" };
  } catch {
    return { ok: false, error: "save-failed" };
  }
}
