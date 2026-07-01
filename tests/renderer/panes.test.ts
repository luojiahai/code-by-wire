import { describe, expect, it, beforeEach } from "vitest";
import {
  $paneStates,
  ensurePaneRegistered,
  togglePane,
  setPaneOpen,
  setPaneWidthOverride,
  clearPaneWidthOverride,
} from "../../src/renderer/src/shell/panes";

describe("pane store", () => {
  beforeEach(() => {
    localStorage.clear();
    $paneStates.set({});
  });

  it("registers a pane once with its default open state", () => {
    ensurePaneRegistered("p", { open: true });
    ensurePaneRegistered("p", { open: false }); // no-op: already registered
    expect($paneStates.get().p).toEqual({
      open: true,
      widthOverride: undefined,
    });
  });
  it("toggles and sets open", () => {
    ensurePaneRegistered("p", { open: true });
    togglePane("p");
    expect($paneStates.get().p.open).toBe(false);
    setPaneOpen("p", true);
    expect($paneStates.get().p.open).toBe(true);
  });
  it("sets and clears a width override", () => {
    ensurePaneRegistered("p", { open: true });
    setPaneWidthOverride("p", 300);
    expect($paneStates.get().p.widthOverride).toBe(300);
    clearPaneWidthOverride("p");
    expect($paneStates.get().p.widthOverride).toBeUndefined();
  });
  it("persists to localStorage", () => {
    ensurePaneRegistered("p", { open: true });
    setPaneWidthOverride("p", 250);
    expect(
      JSON.parse(localStorage.getItem("cbw.paneStates.v1")!).p.widthOverride,
    ).toBe(250);
  });
});
