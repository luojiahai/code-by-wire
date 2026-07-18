import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, symlinkSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeManagedCwd } from "../../src/main/terminal/ipc";

describe("normalizeManagedCwd", () => {
  it("resolves a symlinked directory to its physical path", () => {
    // Real-world proof this matters: even os.tmpdir() itself is a symlink on macOS
    // (/var/folders/... -> /private/var/folders/...), so the base dir is realpath'd first —
    // otherwise this assertion would pass for the wrong reason.
    const base = realpathSync(mkdtempSync(join(tmpdir(), "normalize-cwd-")));
    const real = join(base, "real");
    const link = join(base, "link");
    mkdirSync(real);
    symlinkSync(real, link);
    expect(normalizeManagedCwd(link)).toBe(real);
  });

  it("returns an already-physical path unchanged", () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), "normalize-cwd-")));
    expect(normalizeManagedCwd(base)).toBe(base);
  });

  it("falls back to the raw cwd when realpath fails (e.g. a vanished directory)", () => {
    const missing = join(tmpdir(), "normalize-cwd-missing-does-not-exist");
    expect(normalizeManagedCwd(missing)).toBe(missing);
  });
});
