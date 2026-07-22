import { afterEach, describe, expect, it, vi } from "vitest";
import type { Terminal } from "@xterm/xterm";
import { attachOverlayScrollbar } from "../../src/renderer/src/xterm/overlay-scrollbar";

describe("attachOverlayScrollbar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it("relayouts when the host pixel height changes without an xterm resize", () => {
    let resizeHost: (() => void) | undefined;
    const disconnect = vi.fn();
    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeHost = () => callback([], this);
      }

      observe = vi.fn();
      disconnect = disconnect;
      unobserve = vi.fn();
    }
    vi.stubGlobal("ResizeObserver", TestResizeObserver);

    const parent = document.createElement("div");
    const viewport = document.createElement("div");
    viewport.className = "xterm-viewport";
    parent.appendChild(viewport);
    document.body.appendChild(parent);

    let hostHeight = 420;
    Object.defineProperty(parent, "clientHeight", {
      get: () => hostHeight,
    });
    Object.defineProperties(viewport, {
      clientHeight: { value: 400 },
      scrollHeight: { value: 1_000 },
      scrollTop: { value: 600, writable: true },
    });

    const renderDisposable = { dispose: vi.fn() };
    const resizeDisposable = { dispose: vi.fn() };
    const term = {
      buffer: { active: { length: 1_000 } },
      onRender: vi.fn(() => renderDisposable),
      onResize: vi.fn(() => resizeDisposable),
    } as unknown as Terminal;

    const dispose = attachOverlayScrollbar(parent, term);
    const thumb = parent.querySelector<HTMLElement>(".overlay-scroll-thumb");
    expect(thumb?.style.height).toBe("168px");
    expect(thumb?.style.transform).toBe("translateY(252px)");

    hostHeight = 430;
    resizeHost?.();

    expect(thumb?.style.height).toBe("172px");
    expect(thumb?.style.transform).toBe("translateY(258px)");

    dispose();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
