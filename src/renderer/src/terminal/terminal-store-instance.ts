import { isMacPlatform } from "@shared/platform";
import { createTerminalStore } from "./terminal-store";
import { createXterm } from "./xterm-factory";

/** The one store the app uses, wired to the real terminal IPC and real xterm. Tests build their own
 *  store with fakes via createTerminalStore and never import this module. */
export const terminalStore = createTerminalStore({
  api: window.api.terminal,
  createTerminal: createXterm,
  isMac: isMacPlatform(window.api.platform),
});
