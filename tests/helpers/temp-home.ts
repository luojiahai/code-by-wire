import { afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Per-file temp-dir factory with automatic cleanup. Call once at module scope; it registers its own
 *  afterEach and returns a maker that mints a fresh temp dir (and tracks it for teardown) each call. */
export function tempHomes(prefix = "cbw-"): () => string {
  const homes: string[] = [];
  afterEach(() => {
    for (const home of homes.splice(0))
      rmSync(home, { recursive: true, force: true });
  });
  return () => {
    const home = mkdtempSync(join(tmpdir(), prefix));
    homes.push(home);
    return home;
  };
}
