import { useEffect, useState } from "react";
export const matchesQuery = (q: string) =>
  typeof window !== "undefined" &&
  !!window.matchMedia &&
  window.matchMedia(q).matches;
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => matchesQuery(query));
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
export const NARROW_VIEWPORT_QUERY = "(max-width: 768px)";
