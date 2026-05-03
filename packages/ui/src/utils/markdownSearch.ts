export interface MarkdownSearchMatch {
  index: number;
  start: number;
  end: number;
  text: string;
}

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLocaleLowerCase();
}

export function findMarkdownSearchMatches(content: string, query: string): MarkdownSearchMatch[] {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) {
    return [];
  }

  const normalizedContent = content.toLocaleLowerCase();
  const matches: MarkdownSearchMatch[] = [];
  let cursor = 0;

  while (cursor < normalizedContent.length) {
    const start = normalizedContent.indexOf(normalizedQuery, cursor);
    if (start === -1) {
      break;
    }

    const end = start + normalizedQuery.length;
    matches.push({
      index: matches.length,
      start,
      end,
      text: content.slice(start, end)
    });
    cursor = end;
  }

  return matches;
}
