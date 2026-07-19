/** The five token kinds shown across the app, in the session-panel grouping order (fresh → cached). Each
 *  carries its display label and the popover description (spec copy). The two cache-write kinds are the
 *  indented sub-rows of the grouped "Cache write" row. */
export interface TokenKind {
  key: "input" | "output" | "cacheRead" | "cacheWrite5m" | "cacheWrite1h";
  label: string;
  description: string;
}

export const TOKEN_KINDS: TokenKind[] = [
  {
    key: "input",
    label: "Input",
    description: "Fresh prompt tokens processed this session, at full price.",
  },
  {
    key: "output",
    label: "Output",
    description: "Tokens the model generated.",
  },
  {
    key: "cacheRead",
    label: "Cache read",
    description:
      "Context replayed from cache instead of reprocessed, ~10% of input price.",
  },
  {
    key: "cacheWrite5m",
    label: "Cache write 5m",
    description:
      "Context written into the 5-minute cache so the next turn replays it cheaply. 1.25× input.",
  },
  {
    key: "cacheWrite1h",
    label: "Cache write 1h",
    description:
      "Context written into the longer-lived 1-hour cache. 2× input.",
  },
];

/** The codex row set: codex reports no cache-write tokens at all (its CLI ≤0.144 drops the API's
 *  cache_write_tokens field during parsing), so its Spend panel renders only the three kinds that
 *  carry real data. Derived from TOKEN_KINDS so order and copy can never drift. */
export const CORE_TOKEN_KINDS: TokenKind[] = TOKEN_KINDS.filter((k) =>
  ["input", "output", "cacheRead"].includes(k.key),
);
