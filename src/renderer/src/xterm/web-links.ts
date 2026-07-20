import { WebLinksAddon } from "@xterm/addon-web-links";

/**
 * WebLinksAddon with an explicit activate handler routing through the app's http(s)-guarded
 * IPC.openExternal, rather than the addon's default window.open — belt-and-suspenders alongside
 * main's setWindowOpenHandler guard (index.ts), which would otherwise catch it anyway. Only
 * http(s):// URLs linkify — that's all the addon detects — and the main handler re-guards the
 * scheme.
 */
export function createWebLinksAddon(
  openExternal: (url: string) => void,
): WebLinksAddon {
  return new WebLinksAddon((_event, uri) => openExternal(uri));
}
