/** POSIX single-quote escaping: wrap in single quotes, escaping an embedded single quote as `'\''`.
 *  Safe for any string — spaces, `$`, `` ` ``, `"`, `\` all pass through literally inside single
 *  quotes; the only sequence that needs special handling is another single quote. */
export function quoteShellArg(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}
