import { describe, expect, it } from 'vitest';
import { findMarkdownSearchMatches, normalizeSearchQuery } from './markdownSearch';

describe('markdownSearch', () => {
  it('normalizes empty queries', () => {
    expect(normalizeSearchQuery('  ')).toBe('');
    expect(findMarkdownSearchMatches('# Title', '')).toEqual([]);
  });

  it('finds case-insensitive matches', () => {
    expect(findMarkdownSearchMatches('Alpha beta ALPHA', 'alpha')).toEqual([
      { index: 0, start: 0, end: 5, text: 'Alpha' },
      { index: 1, start: 11, end: 16, text: 'ALPHA' }
    ]);
  });

  it('finds multiple matches', () => {
    expect(findMarkdownSearchMatches('one one one', 'one')).toHaveLength(3);
  });

  it('finds Chinese keyword matches', () => {
    expect(findMarkdownSearchMatches('知识工作区支持知识搜索', '知识')).toEqual([
      { index: 0, start: 0, end: 2, text: '知识' },
      { index: 1, start: 7, end: 9, text: '知识' }
    ]);
  });
});
