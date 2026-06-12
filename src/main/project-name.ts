import { basename } from "node:path";

/**
 * Human-friendly project name from a working directory: the final path segment, or 'unknown' when the
 * cwd is empty or the filesystem root. One definition so a Managed draft and the discovered row for the
 * same session never disagree on the name.
 */
export function projectFromCwd(cwd: string | undefined): string {
  return (cwd && basename(cwd)) || "unknown";
}
