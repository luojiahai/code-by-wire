export interface DocsNavEntry {
  id: string;
  data: {
    order: number;
  };
}

export function sortDocsNav<T extends DocsNavEntry>(pages: T[]): T[] {
  return [...pages].sort(
    (a, b) => a.data.order - b.data.order || a.id.localeCompare(b.id),
  );
}

export interface PrevNext<T> {
  prev: T | null;
  next: T | null;
}

export function getPrevNext<T extends DocsNavEntry>(
  sortedPages: T[],
  currentId: string,
): PrevNext<T> {
  const index = sortedPages.findIndex((page) => page.id === currentId);
  if (index === -1) {
    return { prev: null, next: null };
  }
  return {
    prev: index > 0 ? sortedPages[index - 1] : null,
    next: index < sortedPages.length - 1 ? sortedPages[index + 1] : null,
  };
}
