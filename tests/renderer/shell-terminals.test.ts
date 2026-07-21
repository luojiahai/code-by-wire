import { beforeEach, describe, expect, it } from "vitest";
import {
  $activeSessionCwd,
  $terminalAllowed,
  $terminalTakeover,
  $terminalVisible,
  setTerminalAllowed,
  setTerminalTakeover,
} from "../../src/renderer/src/shell-terminal/store";
import {
  $activeTerminalId,
  $terminals,
  closeAllTerminals,
  closeOtherTerminals,
  closeTerminal,
  createTerminal,
  cycleTerminal,
  ensureTerminal,
  MAX_REVIVE_BUFFER_CHARS,
  renameTerminal,
  reportTerminalShell,
  selectTerminal,
  updateTerminalReviveBuffer,
} from "../../src/renderer/src/shell-terminal/terminals";

beforeEach(() => {
  $terminals.set([]);
  $activeTerminalId.set(null);
  setTerminalTakeover(false);
  setTerminalAllowed(true);
  $activeSessionCwd.set(undefined);
});

describe("$terminalVisible", () => {
  it("shows only when the preference is on AND the route allows it", () => {
    const table: [boolean, boolean, boolean][] = [
      [false, false, false],
      [false, true, false],
      [true, false, false],
      [true, true, true],
    ];
    for (const [active, allowed, visible] of table) {
      setTerminalTakeover(active);
      setTerminalAllowed(allowed);
      expect($terminalVisible.get()).toBe(visible);
    }
  });

  it("restores an open terminal when the route allows it again", () => {
    setTerminalTakeover(true);
    setTerminalAllowed(false); // user navigates to Stats/Settings/New session
    expect($terminalVisible.get()).toBe(false);
    expect($terminalTakeover.get()).toBe(true); // the preference is untouched…
    setTerminalAllowed(true); // …so returning to a session brings it back
    expect($terminalVisible.get()).toBe(true);
  });

  it("never persists the route gate over the user's preference", () => {
    setTerminalTakeover(true);
    setTerminalAllowed(false);
    expect(window.localStorage.getItem("cbw.terminalTakeover")).toBe("true");
    expect($terminalAllowed.get()).toBe(false);
  });
});

describe("createTerminal", () => {
  it("appends, focuses, and snapshots the active session cwd once", () => {
    $activeSessionCwd.set("/repo");
    const id = createTerminal();
    expect($terminals.get()).toHaveLength(1);
    expect($terminals.get()[0]).toMatchObject({
      id,
      cwd: "/repo",
      auto: true,
      title: "Terminal",
    });
    expect($activeTerminalId.get()).toBe(id);
    $activeSessionCwd.set("/elsewhere");
    expect($terminals.get()[0].cwd).toBe("/repo"); // snapshotted, not live
  });

  it("falls back to empty cwd with no session (main resolves home)", () => {
    createTerminal();
    expect($terminals.get()[0].cwd).toBe("");
  });
});

describe("ensureTerminal", () => {
  it("creates one only when empty", () => {
    ensureTerminal();
    ensureTerminal();
    expect($terminals.get()).toHaveLength(1);
  });
});

describe("close/focus semantics", () => {
  it("slides focus to the neighbor filling the slot, then the previous", () => {
    const a = createTerminal();
    const b = createTerminal();
    const c = createTerminal();
    selectTerminal(b);
    closeTerminal(b);
    expect($activeTerminalId.get()).toBe(c); // the neighbor that filled b's index
    closeTerminal(c);
    expect($activeTerminalId.get()).toBe(a);
  });

  it("closing the last tab hides the pane", () => {
    setTerminalTakeover(true);
    const a = createTerminal();
    closeTerminal(a);
    expect($terminals.get()).toHaveLength(0);
    expect($terminalTakeover.get()).toBe(false);
  });

  it("closeOtherTerminals keeps + focuses the survivor; closeAllTerminals hides the pane", () => {
    const a = createTerminal();
    createTerminal();
    createTerminal();
    closeOtherTerminals(a);
    expect($terminals.get().map((t) => t.id)).toEqual([a]);
    expect($activeTerminalId.get()).toBe(a);
    setTerminalTakeover(true);
    closeAllTerminals();
    expect($terminals.get()).toHaveLength(0);
    expect($terminalTakeover.get()).toBe(false);
  });
});

describe("cycleTerminal", () => {
  it("wraps both directions and no-ops under two tabs", () => {
    const a = createTerminal();
    cycleTerminal(1);
    expect($activeTerminalId.get()).toBe(a);
    const b = createTerminal();
    const c = createTerminal();
    selectTerminal(c);
    cycleTerminal(1);
    expect($activeTerminalId.get()).toBe(a); // wrap forward
    cycleTerminal(-1);
    expect($activeTerminalId.get()).toBe(c); // wrap back
    void b;
  });
});

describe("labels", () => {
  it("reportTerminalShell adopts the shell name only while auto", () => {
    const a = createTerminal();
    reportTerminalShell(a, "zsh");
    expect($terminals.get()[0].title).toBe("zsh");
    renameTerminal(a, "build");
    reportTerminalShell(a, "bash");
    expect($terminals.get()[0].title).toBe("build"); // manual rename wins
    expect($terminals.get()[0].auto).toBe(false);
  });
});

describe("updateTerminalReviveBuffer", () => {
  it("tail-trims oversized buffers to the storage cap", () => {
    const a = createTerminal();
    updateTerminalReviveBuffer(
      a,
      "x".repeat(MAX_REVIVE_BUFFER_CHARS + 500) + "TAIL",
    );
    const buf = $terminals.get()[0].reviveBuffer!;
    expect(buf).toHaveLength(MAX_REVIVE_BUFFER_CHARS);
    expect(buf.endsWith("TAIL")).toBe(true);
  });
});
