import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installTerminalKeybind } from "../../src/renderer/src/shell-terminal/keybinds";
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

describe("$terminalAllowed", () => {
  // The suite's beforeEach opens the gate for every other test, which would let the module default
  // silently regress — so read it from a fresh module instance, before anything has set it.
  it("starts closed, so a cold start can't flash the pane open before the route effect runs", async () => {
    vi.resetModules();
    window.localStorage.setItem("cbw.terminalTakeover", "true");
    const fresh = await import("../../src/renderer/src/shell-terminal/store");
    expect(fresh.$terminalTakeover.get()).toBe(true); // preference restored…
    expect(fresh.$terminalAllowed.get()).toBe(false); // …but nothing is visible yet
    expect(fresh.$terminalVisible.get()).toBe(false);
    window.localStorage.removeItem("cbw.terminalTakeover");
  });
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

describe("installTerminalKeybind", () => {
  let uninstall: (() => void) | null = null;
  afterEach(() => {
    uninstall?.();
    uninstall = null;
  });

  const pressCtrlBacktick = (): KeyboardEvent => {
    const e = new KeyboardEvent("keydown", {
      code: "Backquote",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(e);
    return e;
  };

  it("toggles the preference and claims the keystroke on a session route", () => {
    uninstall = installTerminalKeybind();
    const e = pressCtrlBacktick();
    expect($terminalTakeover.get()).toBe(true);
    expect(e.defaultPrevented).toBe(true);
    expect(pressCtrlBacktick().defaultPrevented).toBe(true);
    expect($terminalTakeover.get()).toBe(false);
  });

  it("leaves the keystroke alone off-route rather than swallowing it into a no-op", () => {
    setTerminalAllowed(false);
    uninstall = installTerminalKeybind();
    const e = pressCtrlBacktick();
    expect($terminalTakeover.get()).toBe(false);
    expect(e.defaultPrevented).toBe(false);
  });

  it("ignores modified variants", () => {
    uninstall = installTerminalKeybind();
    for (const mod of ["metaKey", "altKey", "shiftKey"] as const) {
      const e = new KeyboardEvent("keydown", {
        code: "Backquote",
        ctrlKey: true,
        [mod]: true,
        bubbles: true,
        cancelable: true,
      });
      document.body.dispatchEvent(e);
      expect($terminalTakeover.get()).toBe(false);
      expect(e.defaultPrevented).toBe(false);
    }
  });

  it("stops toggling once uninstalled", () => {
    installTerminalKeybind()();
    pressCtrlBacktick();
    expect($terminalTakeover.get()).toBe(false);
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
