// A slash-command user turn is a bundle of envelope tags; its useful label is the command name.
// Surfacing that and dropping the rest is shared by title derivation and transcript rendering, so
// both treat a `/command` prompt identically. Everything outside this known set is left alone, so
// prose keeps its angle brackets (a < b, JSX, generics) instead of being shredded by a blanket strip.
const COMMAND_NAME = /<command-name>([\s\S]*?)<\/command-name>/;
const COMMAND_ENVELOPE =
  /<(command-name|command-message|command-args|command-contents|local-command-stdout|local-command-stderr)>[\s\S]*?<\/\1>/g;

/** The command name in a slash-command turn (e.g. '/code-review'), or undefined for plain prose. */
export function extractCommandName(raw: string): string | undefined {
  return raw.match(COMMAND_NAME)?.[1]?.trim() || undefined;
}

/** Strip the slash-command envelope tags, leaving any surrounding prose (and its newlines) intact. */
export function stripCommandEnvelope(raw: string): string {
  return raw.replace(COMMAND_ENVELOPE, "");
}

/** A short, single-line label for a user prompt: the slash-command name, else the prompt with
 *  whitespace collapsed and truncated to 80 chars. Shared by title derivation and the turn timeline so
 *  the two render a prompt identically. '' for an empty prompt, so callers can fall through. */
export function promptLabel(raw: string): string {
  const command = extractCommandName(raw);
  const cleaned =
    command || stripCommandEnvelope(raw).replace(/\s+/g, " ").trim();
  return cleaned.length > 80 ? cleaned.slice(0, 79) + "…" : cleaned;
}
