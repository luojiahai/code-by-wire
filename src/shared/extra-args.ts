import { AGENT_IDS, type AgentId } from "./agents";

/**
 * Custom launch arguments for spawning an agent session (issues #318/#382): the user-editable
 * suffix of the spawn command. The binary and the app-managed flags are never user input — this
 * module owns only tokenizing the free-text suffix and refusing the flags the app itself manages.
 * Pure and JSX-free on purpose: the renderer runs it for live inline errors, main runs it again
 * at the IPC trust boundary, and both must agree exactly.
 */

export type ExtraArgsError =
  | { kind: "unbalanced-quote" }
  | { kind: "reserved"; token: string };

export type ExtraArgsResult =
  | { ok: true; tokens: string[] }
  | ({ ok: false } & ExtraArgsError);

/** A named, reusable args string for one agent (the New-session preset picker). */
export interface LaunchPreset {
  name: string;
  args: string;
}

/** Presets per agent — every agent keyed, so renderer lookups never need a null guard. */
export type LaunchPresets = Record<AgentId, LaunchPreset[]>;

export function emptyLaunchPresets(): LaunchPresets {
  return Object.fromEntries(AGENT_IDS.map((id) => [id, []])) as LaunchPresets;
}

/** Session-identity flags the app itself passes (or may pass on resume/fork) for claude. A user
 *  duplicate would silently break the pty↔Transcript correlation, so they are refused up front.
 *  Checked against every token, so a VALUE that happens to equal one (e.g. `--flag -r`) is also
 *  refused — an accepted false positive; clear refusal beats a silently broken session. */
const CLAUDE_RESERVED = new Set([
  "--session-id",
  "--resume",
  "-r",
  "--continue",
  "-c",
  "--fork-session",
]);

/** Shell-like tokenizer for the args suffix: splits on spaces/tabs; `"…"` and `'…'` spans group
 *  (and may sit mid-token, so `--flag="a b"` is one token); backslash is a LITERAL character —
 *  never an escape — so Windows paths pass through untouched. */
function tokenize(
  input: string,
): { ok: true; tokens: string[] } | { ok: false; kind: "unbalanced-quote" } {
  const tokens: string[] = [];
  let current = "";
  let started = false;
  let quote: '"' | "'" | null = null;
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true; // an empty "" still yields a token
    } else if (ch === " " || ch === "\t") {
      if (started) {
        tokens.push(current);
        current = "";
        started = false;
      }
    } else {
      current += ch;
      started = true;
    }
  }
  if (quote) return { ok: false, kind: "unbalanced-quote" };
  if (started) tokens.push(current);
  return { ok: true, tokens };
}

/**
 * Tokenize and validate a raw extra-args string for `agent`. Codex takes no reserved FLAGS, but a
 * leading positional word would be parsed by the CLI as a subcommand (`codex resume …`) and hijack
 * the managed-spawn semantics, so the first token must be flag-shaped.
 */
export function validateExtraArgs(
  agent: AgentId,
  input: string,
): ExtraArgsResult {
  const t = tokenize(input);
  if (!t.ok) return t;
  if (agent === "claude") {
    for (const token of t.tokens) {
      const flag = token.split("=", 1)[0];
      if (CLAUDE_RESERVED.has(flag))
        return { ok: false, kind: "reserved", token: flag };
    }
  } else {
    const first = t.tokens[0];
    if (first !== undefined && !first.startsWith("-"))
      return { ok: false, kind: "reserved", token: first };
  }
  return t;
}

/** English backstop message for main-process refusals (a bypassed renderer). The renderer never
 *  shows this — it derives a localized message from the ExtraArgsError kind before submitting. */
export function extraArgsErrorMessage(e: ExtraArgsError): string {
  return e.kind === "unbalanced-quote"
    ? "Unclosed quote in launch arguments"
    : `Reserved launch argument: ${e.token}`;
}
