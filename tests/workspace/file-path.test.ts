import { describe, it, expect } from "vitest";
import { splitFilePath } from "../../src/renderer/src/workspace/file-path";

describe("splitFilePath — split a path into parent dir and filename", () => {
  it("splits a nested posix path, keeping the trailing slash on the dir", () => {
    expect(splitFilePath("src/renderer/src/workspace/DiffModal.tsx")).toEqual({
      dir: "src/renderer/src/workspace/",
      name: "DiffModal.tsx",
    });
  });

  it("returns an empty dir for a bare filename", () => {
    expect(splitFilePath("DiffModal.tsx")).toEqual({
      dir: "",
      name: "DiffModal.tsx",
    });
  });

  it("splits on a Windows backslash separator too", () => {
    expect(splitFilePath("src\\renderer\\DiffModal.tsx")).toEqual({
      dir: "src\\renderer\\",
      name: "DiffModal.tsx",
    });
  });

  it("splits on the last separator when both kinds appear", () => {
    expect(splitFilePath("C:\\repo/src/DiffModal.tsx")).toEqual({
      dir: "C:\\repo/src/",
      name: "DiffModal.tsx",
    });
  });
});
