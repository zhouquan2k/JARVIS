import type { ContextSearchMatch } from '../../interfaces/IContextProvider';

export interface SearchableScopedFile {
    path: string;
    readContent: () => Promise<string>;
}

export function normalizeScopePath(value?: string): string | undefined {
    if (!value) {
        return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed || trimmed === '/') {
        return undefined;
    }

    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    const normalized = withLeadingSlash.replace(/\/+/g, '/').replace(/\/$/, '');
    return normalized || undefined;
}

export function normalizeSearchRequest(query: string | undefined, maxResults?: number): { query: string; maxResults: number } {
    const normalizedQuery = query?.trim();
    if (!normalizedQuery) {
        throw new Error('query must not be empty.');
    }

    return {
        query: normalizedQuery,
        maxResults: typeof maxResults === 'number' && Number.isFinite(maxResults)
            ? Math.max(1, Math.floor(maxResults))
            : 20
    };
}

export function isPathWithinScope(targetPath: string, scopePath?: string): boolean {
    const normalizedScope = normalizeScopePath(scopePath);
    if (!normalizedScope) {
        return true;
    }

    return targetPath === normalizedScope || targetPath.startsWith(`${normalizedScope}/`);
}

export function collectSearchMatches(filePath: string, content: string, query: string): ContextSearchMatch[] {
    const matches: ContextSearchMatch[] = [];
    const normalizedQuery = query.toLowerCase();
    const lines = content.split('\n');

    lines.forEach((lineContent, lineIndex) => {
        const haystack = lineContent.toLowerCase();
        let offset = 0;
        while (offset <= haystack.length) {
            const matchIndex = haystack.indexOf(normalizedQuery, offset);
            if (matchIndex < 0) {
                break;
            }

            matches.push({
                path: filePath,
                line: lineIndex + 1,
                column: matchIndex + 1,
                preview: lineContent
            });
            offset = matchIndex + Math.max(normalizedQuery.length, 1);
        }
    });

    return matches;
}

export async function searchInScopedFiles(options: {
    query: string;
    scopePath?: string;
    maxResults?: number;
    files: Iterable<SearchableScopedFile> | AsyncIterable<SearchableScopedFile>;
}): Promise<ContextSearchMatch[]> {
    const { query, maxResults } = normalizeSearchRequest(options.query, options.maxResults);
    const searchableFiles: SearchableScopedFile[] = [];

    for await (const file of options.files) {
        if (!isPathWithinScope(file.path, options.scopePath)) {
            continue;
        }
        searchableFiles.push(file);
    }

    searchableFiles.sort((left, right) => left.path.localeCompare(right.path, 'zh-Hans-CN'));

    const matches: ContextSearchMatch[] = [];
    for (const file of searchableFiles) {
        const content = await file.readContent();
        matches.push(...collectSearchMatches(file.path, content, query));
        if (matches.length >= maxResults) {
            return matches.slice(0, maxResults);
        }
    }

    return matches;
}
