import { describe, expect, it } from 'vitest';
import { extractHistoryItemTitle } from './geminiHistoryListTitle';

class MockElement {
    constructor(
        public textContent: string | null = '',
        private readonly attributes: Record<string, string> = {},
        private readonly selectors: Record<string, MockElement | null> = {}
    ) {}

    matches(selector: string): boolean {
        return Boolean(this.selectors[`self:${selector}`]);
    }

    querySelector(selector: string): Element | null {
        return (this.selectors[selector] ?? null) as unknown as Element | null;
    }

    getAttribute(name: string): string | null {
        return this.attributes[name] ?? null;
    }
}

describe('extractHistoryItemTitle', () => {
    it('prefers explicit conversation title element text', () => {
        const titleElement = new MockElement('真实标题');
        const item = new MockElement('', {}, {
            '.conversation-title': titleElement
        });

        expect(extractHistoryItemTitle(item as unknown as Element, '.conversation-title, [aria-label]', null)).toBe('真实标题');
    });

    it('falls back to aria-label when the title element has no visible text', () => {
        const linkElement = new MockElement('', { 'aria-label': '侧栏标题' });
        const item = new MockElement('', {}, {
            '[aria-label]': linkElement
        });

        expect(extractHistoryItemTitle(item as unknown as Element, '.conversation-title, [aria-label]', linkElement as unknown as HTMLAnchorElement)).toBe('侧栏标题');
    });

    it('falls back to the item text when no dedicated title node exists', () => {
        const item = new MockElement('   来自整体文本的标题   ');

        expect(extractHistoryItemTitle(item as unknown as Element, '.conversation-title, [aria-label]', null)).toBe('来自整体文本的标题');
    });

    it('prefers only the first line of title-like text instead of including summary content', () => {
        const item = new MockElement('标题文本\n这里是摘要内容');

        expect(extractHistoryItemTitle(item as unknown as Element, '.conversation-title, [aria-label]', null)).toBe('标题文本');
    });

    it('uses builtin conversation title selectors when the provided selector misses', () => {
        const builtinTitleElement = new MockElement('内建标题');
        const item = new MockElement('内建标题 这里是摘要', {}, {
            '.conversation-title': builtinTitleElement
        });

        expect(extractHistoryItemTitle(item as unknown as Element, '.non-existent-title', null)).toBe('内建标题');
    });
});
