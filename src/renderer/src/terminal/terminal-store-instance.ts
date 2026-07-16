import { osKind } from "@shared/platform";
import { createTerminalStore } from "./terminal-store";
import { createXterm } from "./xterm-factory";

/** The one store the app uses, wired to the real terminal IPC, real xterm, and the main-process
 *  clipboard. Tests build their own store with fakes via createTerminalStore and never import
 *  this module. */
export const terminalStore = createTerminalStore({
  api: window.api.terminal,
  createTerminal: createXterm,
  os: osKind(window.api.platform),
  clipboard: {
    readText: (type) => window.api.clipboardReadText(type),
    writeText: (text) => window.api.clipboardWriteText(text),
  },
});
