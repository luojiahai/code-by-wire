import { describe, expect, it, vi } from "vitest";
import {
  sanitizeDiagnosticFileName,
  saveDiagnosticReport,
} from "../../src/main/diagnostic-save";
import { MAX_DIAGNOSTIC_REPORT_BYTES } from "@shared/diagnostic-report";

describe("diagnostic report save", () => {
  it("sanitizes both POSIX and Windows path-shaped suggestions", () => {
    expect(sanitizeDiagnosticFileName("../../unsafe/report name.md")).toBe(
      "report-name.md",
    );
    expect(sanitizeDiagnosticFileName("C:\\temp\\report.md")).toBe("report.md");
    expect(sanitizeDiagnosticFileName("report")).toBe("report.md");
    expect(sanitizeDiagnosticFileName("..")).toBe("code-by-wire-diagnostic.md");
  });

  it("writes the exact previewed markdown after a successful pick", async () => {
    const showSaveDialog = vi.fn(() =>
      Promise.resolve({
        canceled: false,
        filePath: "/picked/report.md",
      }),
    );
    const write = vi.fn(() => Promise.resolve());
    await expect(
      saveDiagnosticReport(
        { fileName: "report.md", markdown: "# exact\n" },
        { showSaveDialog, write },
      ),
    ).resolves.toEqual({ ok: true, status: "saved" });
    expect(write).toHaveBeenCalledWith("/picked/report.md", "# exact\n");
  });

  it("treats cancel as success and performs no write", async () => {
    const write = vi.fn(() => Promise.resolve());
    await expect(
      saveDiagnosticReport(
        { fileName: "report.md", markdown: "body" },
        {
          showSaveDialog: () => Promise.resolve({ canceled: true }),
          write,
        },
      ),
    ).resolves.toEqual({ ok: true, status: "canceled" });
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects oversized content before opening a dialog", async () => {
    const showSaveDialog = vi.fn(() => Promise.resolve({ canceled: true }));
    const write = vi.fn(() => Promise.resolve());
    await expect(
      saveDiagnosticReport(
        {
          fileName: "report.md",
          markdown: "x".repeat(MAX_DIAGNOSTIC_REPORT_BYTES + 1),
        },
        { showSaveDialog, write },
      ),
    ).resolves.toEqual({ ok: false, error: "save-failed" });
    expect(showSaveDialog).not.toHaveBeenCalled();
  });

  it("maps picker and write failures to a stable error", async () => {
    await expect(
      saveDiagnosticReport(
        { fileName: "report.md", markdown: "body" },
        {
          showSaveDialog: () =>
            Promise.resolve({
              canceled: false,
              filePath: "/picked/report.md",
            }),
          write: () => Promise.reject(new Error("EACCES /private/path")),
        },
      ),
    ).resolves.toEqual({ ok: false, error: "save-failed" });
  });
});
