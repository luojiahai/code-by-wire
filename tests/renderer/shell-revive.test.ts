import { describe, expect, it } from "vitest";
import {
  cleanReviveSnapshot,
  keepEscapeSequences,
  stripEscapeSequences,
  stripInitialPromptGap,
} from "../../src/renderer/src/shell-terminal/revive";
import { quotePathForShell } from "../../src/renderer/src/xterm/file-drop";

describe("stripEscapeSequences", () => {
  it("drops CSI, OSC, and short ESC forms, keeping printable text", () => {
    expect(stripEscapeSequences("\x1b[31mred\x1b[0m")).toBe("red");
    expect(stripEscapeSequences("\x1b]0;title\x07text")).toBe("text");
    expect(stripEscapeSequences("\x1b(Bok")).toBe("ok"); // charset selector is 3 bytes
  });
  it("OSC terminated by ST (ESC-backslash), not just BEL", () => {
    expect(stripEscapeSequences("\x1b]0;title\x1b\\text")).toBe("text");
  });
  it("bare 2-byte ESC fallback", () => {
    expect(stripEscapeSequences("\x1bctext")).toBe("text");
  });
});

describe("keepEscapeSequences", () => {
  it("keeps only the control codes", () => {
    expect(keepEscapeSequences("\x1b[2J\x1b[Hboot text")).toBe("\x1b[2J\x1b[H");
    expect(keepEscapeSequences("plain")).toBe("");
  });
});

describe("stripInitialPromptGap", () => {
  it("eats leading newlines but preserves leading escapes and the prompt", () => {
    expect(stripInitialPromptGap("\r\n\r\n$ ")).toBe("$ ");
    expect(stripInitialPromptGap("\x1b[?2004h\r\n$ ")).toBe("\x1b[?2004h$ ");
  });
  it("returns just the escape prefix when everything else is blank", () => {
    expect(stripInitialPromptGap("\x1b[0m\r\n")).toBe("\x1b[0m");
  });
});

describe("cleanReviveSnapshot", () => {
  it("trims a short idle-prompt tail after the last blank line", () => {
    const snap = "cmd output line\r\n\r\nuser@host ~ %";
    expect(cleanReviveSnapshot(snap)).toBe("cmd output line");
  });
  it("keeps a long tail — that's real output, not a prompt", () => {
    const tail = ["l1", "l2", "l3", "l4", "l5"].join("\r\n");
    const snap = `before\r\n\r\n${tail}`;
    expect(cleanReviveSnapshot(snap)).toBe(`before\r\n\r\n${tail}`);
  });
  it("boundary: 3-line tail after blank is trimmed", () => {
    const tail = ["line1", "line2", "line3"].join("\r\n");
    const snap = `before\r\n\r\n${tail}`;
    expect(cleanReviveSnapshot(snap)).toBe("before");
  });
  it("boundary: 4-line tail after blank is kept", () => {
    const tail = ["line1", "line2", "line3", "line4"].join("\r\n");
    const snap = `before\r\n\r\n${tail}`;
    expect(cleanReviveSnapshot(snap)).toBe(`before\r\n\r\n${tail}`);
  });
});

describe("quotePathForShell", () => {
  it("POSIX-quotes with escaped single quotes", () => {
    expect(quotePathForShell("/a/it's here", "zsh")).toBe("'/a/it'\\''s here'");
  });
  it("doubles single quotes for PowerShell", () => {
    expect(quotePathForShell("C:\\a's", "pwsh.exe")).toBe("'C:\\a''s'");
  });
  it("double-quotes for cmd", () => {
    expect(quotePathForShell('C:\\a"b', "cmd.exe")).toBe('"C:\\a""b"');
  });
});
