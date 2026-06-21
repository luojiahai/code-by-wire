/** True only for http(s) URLs. The openExternal IPC guards on this so a malformed or hostile value can't
 *  hand shell.openExternal a file:// path or a custom-scheme handler. */
export function isHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
