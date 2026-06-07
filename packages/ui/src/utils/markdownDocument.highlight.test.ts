// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMarkdownEditor, destroyMarkdownEditor, readMarkdownDocument } from './markdownDocument';

afterEach(() => {
    document.body.innerHTML = '';
});

describe('markdownDocument highlight integration', () => {
    it('renders Obsidian-style ==highlight== as a mark in viewer mode', async () => {
        const root = document.createElement('div');
        document.body.append(root);

        const editor = await createMarkdownEditor({
            root,
            content: 'Before ==Alpha== after',
            mode: 'viewer',
            documentPath: '/docs/highlight.md',
            onChange: vi.fn()
        });

        try {
            const highlight = root.querySelector('mark.markdown-highlight');
            expect(highlight?.textContent).toBe('Alpha');
            expect(root.textContent).toContain('Before Alpha after');
            expect(root.textContent).not.toContain('==Alpha==');
            expect(readMarkdownDocument(editor)).toContain('==Alpha==');
        } finally {
            await destroyMarkdownEditor(editor);
        }
    });
});
