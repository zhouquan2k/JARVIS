// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const renderMermaidPreview = vi.fn();
    const crepeInstances: MockCrepe[] = [];

    class MockCrepe {
        readonly options: Record<string, any>;
        readonly editor = { action: vi.fn() };
        private markdown = '';

        constructor(options: Record<string, any>) {
            this.options = options;
            this.markdown = options.defaultValue;
            crepeInstances.push(this);
        }

        on() {
            return this;
        }

        async create() {
            return undefined;
        }

        async destroy() {
            return undefined;
        }

        getMarkdown() {
            return this.markdown;
        }
    }

    return {
        renderMermaidPreview,
        crepeInstances,
        MockCrepe
    };
});

vi.mock('./mermaidPreview', () => ({
    renderMermaidPreview: mocks.renderMermaidPreview
}));

vi.mock('@milkdown/kit/utils', () => ({
    replaceAll: vi.fn((content: string) => ({ content }))
}));

vi.mock('@milkdown/crepe', () => ({
    Crepe: mocks.MockCrepe,
    CrepeFeature: {
        BlockEdit: 'block-edit',
        CodeMirror: 'code-mirror',
        Cursor: 'cursor',
        ImageBlock: 'image-block',
        Latex: 'latex',
        LinkTooltip: 'link-tooltip',
        ListItem: 'list-item',
        Placeholder: 'placeholder',
        Table: 'table',
        Toolbar: 'toolbar'
    }
}));

describe('markdownDocument', () => {
    it('enables table support in viewer mode without rewriting markdown table source', async () => {
        const { createMarkdownEditor, readMarkdownDocument } = await import('./markdownDocument');
        const root = document.createElement('div');
        const content = [
            '| Name | Type |',
            '| --- | --- |',
            '| id | string |'
        ].join('\n');

        const editor = await createMarkdownEditor({
            root,
            content,
            mode: 'viewer',
            documentPath: '/notes/table.md',
            onChange: vi.fn()
        });

        const crepeOptions = mocks.crepeInstances.at(-1)?.options;
        expect(crepeOptions?.features?.table).toBe(true);
        expect(readMarkdownDocument(editor)).toBe(content);
    });

    it('keeps table support enabled in edit mode', async () => {
        const { createMarkdownEditor, readMarkdownDocument } = await import('./markdownDocument');
        const root = document.createElement('div');
        const content = [
            '| Name | Type |',
            '| --- | --- |',
            '| id | string |'
        ].join('\n');

        const editor = await createMarkdownEditor({
            root,
            content,
            mode: 'edit',
            documentPath: '/notes/table.md',
            onChange: vi.fn()
        });

        const crepeOptions = mocks.crepeInstances.at(-1)?.options;
        expect(crepeOptions?.features?.table).toBe(true);
        expect(readMarkdownDocument(editor)).toBe(content);
    });

    it('wires Mermaid preview only in viewer mode', async () => {
        const { createMarkdownEditor } = await import('./markdownDocument');
        const root = document.createElement('div');
        root.innerHTML = '<div contenteditable="true"></div>';
        const applyPreview = vi.fn();

        await createMarkdownEditor({
            root,
            content: '```mermaid\ngraph TD;\n```',
            mode: 'viewer',
            documentPath: '/notes/guide.md',
            onChange: vi.fn()
        });

        const codeMirrorConfig = mocks.crepeInstances.at(-1)?.options.featureConfigs['code-mirror'];
        codeMirrorConfig.renderPreview('mermaid', 'graph TD;', applyPreview);

        expect(codeMirrorConfig.previewOnlyByDefault).toBe(true);
        expect(mocks.renderMermaidPreview).toHaveBeenCalledTimes(1);
        expect(mocks.renderMermaidPreview).toHaveBeenCalledWith('mermaid', 'graph TD;', applyPreview);
        expect(codeMirrorConfig.renderPreview('ts', 'const value = 1;', applyPreview)).toBeNull();
    });

    it('keeps Mermaid source editable in edit mode', async () => {
        const { createMarkdownEditor } = await import('./markdownDocument');
        const root = document.createElement('div');
        const applyPreview = vi.fn();

        await createMarkdownEditor({
            root,
            content: '```mermaid\ngraph TD;\n```',
            mode: 'edit',
            documentPath: '/notes/guide.md',
            onChange: vi.fn()
        });

        const codeMirrorConfig = mocks.crepeInstances.at(-1)?.options.featureConfigs['code-mirror'];
        expect(codeMirrorConfig.previewOnlyByDefault).toBe(false);
        expect(codeMirrorConfig.renderPreview('mermaid', 'graph TD;', applyPreview)).toBeNull();
    });

    it('resolves markdown image URLs with document-relative paths only when needed', async () => {
        const { normalizeMarkdownViewerContent, resolveMarkdownImageUrl } = await import('./markdownDocument');

        expect(resolveMarkdownImageUrl('https://example.com/a.png', '/notes/guide.md')).toBe('https://example.com/a.png');
        expect(resolveMarkdownImageUrl('data:image/png;base64,abc', '/notes/guide.md')).toBe('data:image/png;base64,abc');
        expect(resolveMarkdownImageUrl('./images/flow.png', '/notes/guide.md')).toBe(
            'http://127.0.0.1:8787/api/context/document-asset?path=%2Fnotes%2Fimages%2Fflow.png'
        );
        expect(resolveMarkdownImageUrl('../shared/flow.png', '/notes/nested/guide.md')).toBe(
            'http://127.0.0.1:8787/api/context/document-asset?path=%2Fnotes%2Fshared%2Fflow.png'
        );
        // wiki embeds → references/ prefix added, renderable become images, non-renderable become links
        expect(normalizeMarkdownViewerContent('![[flow.svg]]')).toBe('![flow.svg](references/flow.svg)');
        expect(normalizeMarkdownViewerContent('![[Pasted image 20260405095014.png]]')).toBe(
            '![Pasted image 20260405095014.png](references/Pasted%20image%2020260405095014.png)'
        );
        expect(normalizeMarkdownViewerContent('![[references/flow.svg]]')).toBe('![flow.svg](references/flow.svg)');
        expect(normalizeMarkdownViewerContent('![[Customer_Transactions_4047340.pdf]]')).toBe(
            '[Customer_Transactions_4047340.pdf](references/Customer_Transactions_4047340.pdf)'
        );
        // standard markdown image syntax: references/ prefix never added — paths are document-relative
        expect(normalizeMarkdownViewerContent('![PDF preview](references/Customer_Transactions_4047340.pdf)')).toBe(
            '[PDF preview](references/Customer_Transactions_4047340.pdf)'
        );
        // standard relative image — must NOT get references/ prepended
        expect(normalizeMarkdownViewerContent('![diagram](./images/flow.png)')).toBe('![diagram](./images/flow.png)');
        expect(normalizeMarkdownViewerContent('![diagram](images/flow.png)')).toBe('![diagram](images/flow.png)');
        // non-renderable standard image becomes a link without references/ prepended
        expect(normalizeMarkdownViewerContent('![report](./report.pdf)')).toBe('[report](./report.pdf)');
    });

    it('opens viewer links without relying on contenteditable default navigation', async () => {
        const { createMarkdownEditor, destroyMarkdownEditor } = await import('./markdownDocument');
        const root = document.createElement('div');
        root.innerHTML = '<div contenteditable="true"><p><a href="references/guide.pdf">guide.pdf</a></p></div>';
        const open = vi.spyOn(window, 'open').mockReturnValue(null);

        const editor = await createMarkdownEditor({
            root,
            content: '[guide.pdf](references/guide.pdf)',
            mode: 'viewer',
            documentPath: '/notes/current.md',
            onChange: vi.fn()
        });

        const anchor = root.querySelector<HTMLAnchorElement>('a[href]');
        expect(anchor?.getAttribute('href')).toBe('references/guide.pdf');

        anchor?.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true
        }));

        expect(open).toHaveBeenCalledWith(
            'http://127.0.0.1:8787/api/context/document-asset?path=%2Fnotes%2Freferences%2Fguide.pdf',
            '_blank'
        );

        await destroyMarkdownEditor(editor);
        open.mockRestore();
    });

    it('does not inject PDF embeds in edit mode', async () => {
        const { createMarkdownEditor, destroyMarkdownEditor } = await import('./markdownDocument');
        const root = document.createElement('div');
        root.innerHTML = '<div contenteditable="true"><p><a href="references/guide.pdf">guide.pdf</a></p></div>';

        const editor = await createMarkdownEditor({
            root,
            content: '[guide.pdf](references/guide.pdf)',
            mode: 'edit',
            documentPath: '/notes/current.md',
            onChange: vi.fn()
        });

        await Promise.resolve();

        expect(root.querySelectorAll('.pdf-inline-embed')).toHaveLength(0);

        await destroyMarkdownEditor(editor);
    });

    it('injects PDF iframe embeds and re-injects after DOM mutation without duplicates', async () => {
        const { createMarkdownEditor, destroyMarkdownEditor } = await import('./markdownDocument');
        const root = document.createElement('div');
        root.innerHTML = '<div contenteditable="true"><p><a href="references/guide.pdf">guide.pdf</a></p></div>';

        const editor = await createMarkdownEditor({
            root,
            content: '[guide.pdf](references/guide.pdf)',
            mode: 'viewer',
            documentPath: '/notes/current.md',
            onChange: vi.fn()
        });

        await Promise.resolve();

        let embeds = root.querySelectorAll<HTMLDivElement>('.pdf-inline-embed');
        expect(embeds).toHaveLength(1);
        expect(embeds[0]?.querySelector('iframe')?.getAttribute('src')).toBe(
            'http://127.0.0.1:8787/api/context/document-asset?path=%2Fnotes%2Freferences%2Fguide.pdf'
        );

        embeds[0]?.remove();
        await new Promise((resolve) => window.setTimeout(resolve, 130));

        embeds = root.querySelectorAll<HTMLDivElement>('.pdf-inline-embed');
        expect(embeds).toHaveLength(1);

        root.querySelector('[contenteditable="true"]')?.append(document.createElement('span'));
        await new Promise((resolve) => window.setTimeout(resolve, 130));

        expect(root.querySelectorAll('.pdf-inline-embed')).toHaveLength(1);

        await destroyMarkdownEditor(editor);
    });
});
