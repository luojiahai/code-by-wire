import { useEffect, useRef, useState } from "react";

/** Copy `value` to the system clipboard and flash a "copied" flag for `ms` (~1.2s). Each copy restarts
 *  the flash so a quick second click holds it for the full beat; the timer is cleared on unmount. Routes
 *  through the main-process clipboard (window.api) rather than navigator.clipboard, which needs a focused
 *  secure context the renderer can't always guarantee. The one copy-to-clipboard path the UI shares. */
export function useCopyFlash(
  value: string,
  ms = 1200,
): { copied: boolean; copy: () => void } {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = (): void => {
    void window.api.clipboardWriteText(value);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), ms);
  };
  return { copied, copy };
}
