import type { Usage } from "@shared/types";

/** Complete a partial Usage with zeros, applying the all-5m cache-write fallback the parsers use: an
 *  unspecified 5m split defaults to (total − 1h), so cacheCreation5m + cacheCreation1h === cacheCreationTokens
 *  always holds. Lets existing fixtures keep their cost behavior (all-5m) and new fixtures pin the split. */
export function usage(over: Partial<Usage> = {}): Usage {
  const cacheCreationTokens = over.cacheCreationTokens ?? 0;
  const cacheCreation1hTokens = over.cacheCreation1hTokens ?? 0;
  return {
    inputTokens: over.inputTokens ?? 0,
    outputTokens: over.outputTokens ?? 0,
    cacheReadTokens: over.cacheReadTokens ?? 0,
    cacheCreationTokens,
    cacheCreation5mTokens:
      over.cacheCreation5mTokens ?? cacheCreationTokens - cacheCreation1hTokens,
    cacheCreation1hTokens,
  };
}
