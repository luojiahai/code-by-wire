/** The eight base SGR foreground colors (codes 30-37; bright variants 90-97 set `bright`). */
export type AnsiColor =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white";

/** One run of text with its resolved SGR style. The renderer maps each to a <span>; this module stays
 *  JSX-free so it typechecks (and is tested) under tsconfig.node.json. Despite the filename it returns
 *  render-ready spans, not raw HTML — no dangerouslySetInnerHTML. */
export interface AnsiSpan {
  text: string;
  fg?: AnsiColor;
  bold?: boolean;
  dim?: boolean;
  bright?: boolean;
}

const BASE: Record<number, AnsiColor> = {
  0: "black",
  1: "red",
  2: "green",
  3: "yellow",
  4: "blue",
  5: "magenta",
  6: "cyan",
  7: "white",
};

interface Style {
  fg?: AnsiColor;
  bold?: boolean;
  dim?: boolean;
  bright?: boolean;
}

/** Apply one SGR parameter list (the numbers in `ESC[ ... m`) to the running style. */
function applySgr(style: Style, params: number[]): Style {
  let next = { ...style };
  for (const p of params) {
    if (p === 0) next = {};
    else if (p === 1) next.bold = true;
    else if (p === 2) next.dim = true;
    else if (p === 22) {
      delete next.bold;
      delete next.dim;
    } else if (p === 39) {
      delete next.fg;
      delete next.bright;
    } else if (p >= 30 && p <= 37) {
      next.fg = BASE[p - 30];
      delete next.bright;
    } else if (p >= 90 && p <= 97) {
      next.fg = BASE[p - 90];
      next.bright = true;
    }
    // bg (40-47/100-107) and other codes are intentionally ignored: minimal SGR per the spec.
  }
  return next;
}

/** A style object → an AnsiSpan, dropping falsey flags so equality in tests is clean. */
function span(text: string, s: Style): AnsiSpan {
  const out: AnsiSpan = { text };
  if (s.fg) out.fg = s.fg;
  if (s.bold) out.bold = true;
  if (s.dim) out.dim = true;
  if (s.bright) out.bright = true;
  return out;
}

/** Parse SGR color/intensity escapes into styled spans; strip every other CSI sequence (cursor/clear).
 *  A bare ESC not followed by `[` is passed through as text. Adjacent text under one style coalesces
 *  into a single span. */
export function ansiToSpans(input: string): AnsiSpan[] {
  const spans: AnsiSpan[] = [];
  let style: Style = {};
  let buf = "";
  const flush = () => {
    if (buf) {
      spans.push(span(buf, style));
      buf = "";
    }
  };
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    // A CSI sequence: ESC '[' params... finalByte. We only act on the 'm' (SGR) final byte.
    if (ch === "\x1b" && input[i + 1] === "[") {
      let j = i + 2;
      while (j < input.length && !/[A-Za-z]/.test(input[j])) j++;
      const finalByte = input[j];
      const body = input.slice(i + 2, j);
      if (finalByte === "m") {
        flush();
        const params =
          body === "" ? [0] : body.split(";").map((n) => Number(n) || 0);
        style = applySgr(style, params);
      }
      // Non-'m' CSI (or an unterminated run) is dropped: advance past it, emit no text.
      i = j; // the for-loop's i++ steps past finalByte
      continue;
    }
    buf += ch;
  }
  flush();
  return spans;
}
