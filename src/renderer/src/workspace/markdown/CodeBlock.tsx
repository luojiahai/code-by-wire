import { useEffect, useState } from "react";
import ShikiHighlighter from "react-shiki/core";
import { CopyButton } from "./CopyButton";
import { getHighlighter, type HighlighterInstance } from "./highlighter";

/**
 * One fenced code block. Highlights with the shared Shiki singleton on the sunken well background.
 * Top-right swaps on hover: the language label shows at rest (react-shiki's own, hidden via
 * `langClassName` on group/code hover, and suppressed entirely for plain `text` fences so a
 * no-language block shows no badge), and the copy button (icon + "Copy") fades in. The button
 * needs `z-10` because react-shiki's wrapper carries `position: relative` (from the stylesheet
 * react-shiki/core imports), making it a positioned later-sibling that would otherwise paint over the
 * button; the well backdrop keeps it legible above the code. While the singleton is still loading it
 * shows the raw code in a plain pre, so first paint never blocks. The `[&_pre]:*` variants force the
 * generated Shiki <pre> onto our well background and padding regardless of theme.
 */
const SURFACE =
  "group/code relative my-2.5 overflow-hidden rounded-lg border border-ink-800";
const PRE_RESET =
  "[&_pre]:!m-0 [&_pre]:!bg-well [&_pre]:overflow-x-auto [&_pre]:!p-3 [&_pre]:font-mono [&_pre]:text-aux [&_pre]:leading-relaxed";
const COPY =
  "absolute right-1.5 top-1.5 z-10 bg-well opacity-0 group-hover/code:opacity-100";

export function CodeBlock({
  code,
  language,
}: {
  code: string;
  language: string;
}) {
  const [hl, setHl] = useState<HighlighterInstance | null>(null);

  useEffect(() => {
    let alive = true;
    void getHighlighter().then(
      (h) => {
        if (alive) setHl(h);
      },
      () => {
        // Build failed; keep the plain-pre fallback. A later mount retries.
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className={`${SURFACE} ${PRE_RESET}`}>
      <CopyButton text={code} label="Copy" className={COPY} />
      {hl ? (
        <ShikiHighlighter
          highlighter={hl}
          language={language}
          theme="vitesse-dark"
          langClassName={
            language === "text" ? "hidden" : "group-hover/code:hidden"
          }
        >
          {code}
        </ShikiHighlighter>
      ) : (
        <pre className="overflow-x-auto bg-well p-3 font-mono text-aux leading-relaxed text-fg">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
