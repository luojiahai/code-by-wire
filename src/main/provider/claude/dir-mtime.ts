import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Newest mtime (ms) among the files in `dir` whose name satisfies `isData`, or 0 when the dir is
 * absent/empty. A file that vanishes mid-scan is skipped. The shared change-token primitive behind the
 * transcript's subagents fold and the tasks read — rewriting any matching file advances the token.
 */
export function newestMtime(
  dir: string,
  isData: (name: string) => boolean,
): number {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return 0;
  }
  let newest = 0;
  for (const name of names) {
    if (!isData(name)) continue;
    try {
      const m = statSync(join(dir, name)).mtimeMs;
      if (m > newest) newest = m;
    } catch {
      // skip a vanished file
    }
  }
  return newest;
}
