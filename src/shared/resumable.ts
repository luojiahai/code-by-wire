/**
 * A session is resumable once it has written a transcript. Both resume actions read it: Resume runs
 * `claude --resume <id>` and Fork runs `claude --resume <id> --session-id <new> --fork-session`, each
 * loading `<id>`'s transcript at `projects/<cwd-slug>/<id>.jsonl`. A brand-new session — a fresh spawn,
 * or a fork that hasn't taken a turn yet — hasn't written one (its optimistic draft carries
 * `transcriptMtimeMs` 0), so the CLI answers "No conversation found with session id" and the resume dies.
 * The transcript mtime is the high-water mark the index already tracks (0 ⇒ no transcript), so it's the
 * honest signal: resumable ⟺ a transcript exists.
 */
export function isResumable(transcriptMtimeMs: number): boolean {
  return transcriptMtimeMs > 0;
}
