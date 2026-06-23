/** Split a file path into its parent directory (including the trailing separator) and its basename.
 *  The diff modal's file bar dims the folders and shows the filename at full strength, so the name is
 *  never the part that gets truncated. Splits on the last `/` or `\` so Windows paths from the
 *  transcript work too. A path with no separator is all name, empty dir. */
export function splitFilePath(path: string): { dir: string; name: string } {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return cut === -1
    ? { dir: "", name: path }
    : { dir: path.slice(0, cut + 1), name: path.slice(cut + 1) };
}
