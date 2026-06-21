import { describe, it, expect, vi } from "vitest";
import { openInTarget, vscodeUrl } from "../src/main/open-in";

function makeShell() {
  return {
    openExternal: vi.fn(() => Promise.resolve()),
    openPath: vi.fn(() => Promise.resolve("")),
  };
}

describe("vscodeUrl", () => {
  it("builds an encoded vscode://file URL for an absolute path", () => {
    expect(vscodeUrl("/Users/foo/my project")).toBe(
      "vscode://file/Users/foo/my%20project",
    );
  });
});

describe("openInTarget", () => {
  const resolveOk = () => "/Users/foo/proj";
  const isDir = () => true;

  it("opens Finder via openPath and reports ok", async () => {
    const shell = makeShell();
    const res = await openInTarget(
      { resolveCwd: resolveOk, statDir: isDir, shell },
      "s1",
      "finder",
    );
    expect(shell.openPath).toHaveBeenCalledWith("/Users/foo/proj");
    expect(shell.openExternal).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: true });
  });

  it("opens VSCode via openExternal with the vscode URL", async () => {
    const shell = makeShell();
    const res = await openInTarget(
      { resolveCwd: () => "/Users/foo/my project", statDir: isDir, shell },
      "s1",
      "vscode",
    );
    expect(shell.openExternal).toHaveBeenCalledWith(
      "vscode://file/Users/foo/my%20project",
    );
    expect(res).toEqual({ ok: true });
  });

  it("fails without calling shell when no cwd resolves", async () => {
    const shell = makeShell();
    const res = await openInTarget(
      { resolveCwd: () => null, statDir: isDir, shell },
      "s1",
      "finder",
    );
    expect(shell.openPath).not.toHaveBeenCalled();
    expect(shell.openExternal).not.toHaveBeenCalled();
    expect(res.ok).toBe(false);
  });

  it("fails without calling shell when no cwd resolves (vscode target)", async () => {
    const shell = makeShell();
    const res = await openInTarget(
      { resolveCwd: () => null, statDir: isDir, shell },
      "s1",
      "vscode",
    );
    expect(shell.openExternal).not.toHaveBeenCalled();
    expect(shell.openPath).not.toHaveBeenCalled();
    expect(res.ok).toBe(false);
  });

  it("fails without calling shell when the path is not a directory", async () => {
    const shell = makeShell();
    const res = await openInTarget(
      { resolveCwd: resolveOk, statDir: () => false, shell },
      "s1",
      "vscode",
    );
    expect(shell.openExternal).not.toHaveBeenCalled();
    expect(shell.openPath).not.toHaveBeenCalled();
    expect(res.ok).toBe(false);
  });

  it("surfaces openPath's non-empty error string", async () => {
    const shell = makeShell();
    shell.openPath = vi.fn(() => Promise.resolve("Failed to open path"));
    const res = await openInTarget(
      { resolveCwd: resolveOk, statDir: isDir, shell },
      "s1",
      "finder",
    );
    expect(res).toEqual({ ok: false, error: "Failed to open path" });
  });
});
