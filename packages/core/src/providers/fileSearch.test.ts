import { describe, expect, it } from 'vitest';
import { collectSearchMatches, isPathWithinScope, searchInScopedFiles } from './fileSearch';

describe('fileSearch', () => {
    it('checks whether a path is within scope', () => {
        expect(isPathWithinScope('/notes/today.md', '/notes')).toBe(true);
        expect(isPathWithinScope('/notes/today.md', '/archive')).toBe(false);
        expect(isPathWithinScope('/notes/today.md')).toBe(true);
    });

    it('collects case-insensitive line matches', () => {
        expect(collectSearchMatches('/notes/today.md', '# Today\nToday again', 'today')).toEqual([
            { path: '/notes/today.md', line: 1, column: 3, preview: '# Today' },
            { path: '/notes/today.md', line: 2, column: 1, preview: 'Today again' }
        ]);
    });

    it('searches files in sorted order and respects maxResults', async () => {
        const matches = await searchInScopedFiles({
            query: 'today',
            scopePath: '/notes',
            maxResults: 2,
            files: [
                {
                    path: '/notes/z-last.md',
                    readContent: async () => 'Today once'
                },
                {
                    path: '/archive/skip.md',
                    readContent: async () => 'Today skipped'
                },
                {
                    path: '/notes/a-first.md',
                    readContent: async () => 'today first\nToday second'
                }
            ]
        });

        expect(matches).toEqual([
            { path: '/notes/a-first.md', line: 1, column: 1, preview: 'today first' },
            { path: '/notes/a-first.md', line: 2, column: 1, preview: 'Today second' }
        ]);
    });
});
