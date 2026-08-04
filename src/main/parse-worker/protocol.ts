import type { PersistedSession, SessionCandidate } from "@shared/types";
import { summarize } from "../provider/claude/discover";

/** One summarize request over the parse-worker port. `seq` correlates the response — the client
 *  serializes the sync pass today, but the protocol must not depend on that. */
export interface ParseRequest {
  seq: number;
  candidate: SessionCandidate;
}

export type ParseResponse =
  | { seq: number; ok: true; session: PersistedSession }
  | { seq: number; ok: false; error: string };

/**
 * The worker's whole brain, pure so it's testable without a utility process: parse the candidate's
 * transcript with the same in-process `summarize` the provider falls back to, never throw — a parse
 * failure travels back as `ok:false` and the client's caller decides (the provider retries
 * in-process). Management/model adornment stays with the provider in main; this side is a pure
 * function of the filesystem.
 */
export function handleParseRequest(
  req: ParseRequest,
  parse: (c: SessionCandidate) => PersistedSession = summarize,
): ParseResponse {
  try {
    return { seq: req.seq, ok: true, session: parse(req.candidate) };
  } catch (err) {
    return {
      seq: req.seq,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
