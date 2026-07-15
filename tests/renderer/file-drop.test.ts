import { describe, expect, it } from "vitest";
import {
  collectDroppedPaths,
  quotePathForShell,
  transferHasDropCandidates,
} from "../../src/renderer/src/xterm/file-drop";

/** Build a fake File whose only meaningful trait for these helpers is identity. */
function fakeFile(tag: string): File {
  return { name: tag } as unknown as File;
}

/** Build a fake DataTransfer from a `files` list and/or an `items` list. */
function fakeTransfer(opts: {
  files?: File[];
  items?: Array<{ kind: string; file?: File }>;
}): DataTransfer {
  const files = opts.files ?? [];
  const items = opts.items ?? [];
  return {
    files: {
      length: files.length,
      item: (i: number) => files[i] ?? null,
    },
    items: items.map((it) => ({
      kind: it.kind,
      getAsFile: () => it.file ?? null,
    })),
  } as unknown as DataTransfer;
}

describe("quotePathForShell (POSIX default)", () => {
  it("single-quotes a plain path", () => {
    expect(quotePathForShell("/Users/me/notes.md")).toBe(
      "'/Users/me/notes.md'",
    );
  });
  it("single-quotes spaces", () => {
    expect(quotePathForShell("/Users/me/My File.txt")).toBe(
      "'/Users/me/My File.txt'",
    );
  });
  it("escapes embedded single quotes", () => {
    expect(quotePathForShell("/a/it's here")).toBe("'/a/it'\\''s here'");
  });
  it("treats backslash paths as opaque text", () => {
    expect(quotePathForShell("C:\\Users\\me\\a.txt")).toBe(
      "'C:\\Users\\me\\a.txt'",
    );
  });
});

describe("transferHasDropCandidates", () => {
  it("is true when files is non-empty", () => {
    expect(
      transferHasDropCandidates(fakeTransfer({ files: [fakeFile("a")] })),
    ).toBe(true);
  });

  it("is true when an item has kind 'file'", () => {
    expect(
      transferHasDropCandidates(
        fakeTransfer({ items: [{ kind: "file", file: fakeFile("a") }] }),
      ),
    ).toBe(true);
  });

  it("is false for a text-only transfer", () => {
    expect(
      transferHasDropCandidates(fakeTransfer({ items: [{ kind: "string" }] })),
    ).toBe(false);
  });
});

describe("collectDroppedPaths", () => {
  it("resolves each file via the injected resolver", () => {
    const paths = collectDroppedPaths(
      fakeTransfer({ files: [fakeFile("a"), fakeFile("b")] }),
      (f) => `/abs/${(f as unknown as { name: string }).name}`,
    );
    expect(paths).toEqual(["/abs/a", "/abs/b"]);
  });

  it("reads from items when files is empty", () => {
    const paths = collectDroppedPaths(
      fakeTransfer({ items: [{ kind: "file", file: fakeFile("c") }] }),
      () => "/abs/c",
    );
    expect(paths).toEqual(["/abs/c"]);
  });

  it("dedups repeated resolutions and trims", () => {
    const paths = collectDroppedPaths(
      fakeTransfer({ files: [fakeFile("a"), fakeFile("a")] }),
      () => "  /abs/a  ",
    );
    expect(paths).toEqual(["/abs/a"]);
  });

  it("skips empty resolutions", () => {
    const paths = collectDroppedPaths(
      fakeTransfer({ files: [fakeFile("a")] }),
      () => "   ",
    );
    expect(paths).toEqual([]);
  });

  it("skips a file whose resolver throws", () => {
    const paths = collectDroppedPaths(
      fakeTransfer({ files: [fakeFile("a"), fakeFile("b")] }),
      (f) => {
        if ((f as unknown as { name: string }).name === "a") {
          throw new Error("no backing");
        }
        return "/abs/b";
      },
    );
    expect(paths).toEqual(["/abs/b"]);
  });
});
