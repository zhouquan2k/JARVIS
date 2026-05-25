// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const renderMermaidPreview = vi.fn();
    const crepeInstances: MockCrepe[] = [];

    class MockCrepe {
        readonly options: Record<string, any>;
        readonly mockView: {
            dom: HTMLElement;
            state: {
                doc: {
                    descendants: (callback: (node: { isText: boolean; text: string }, pos: number) => boolean) => void;
                };
            };
            setProps: ReturnType<typeof vi.fn>;
            updateState: ReturnType<typeof vi.fn>;
        };
        readonly editor: { action: ReturnType<typeof vi.fn> };
        readonly setReadonly: ReturnType<typeof vi.fn>;
        injectedEditorView = true;
        readonly listenerManager: {
            listeners: {
                markdownUpdated: Array<(ctx: unknown, markdown: string, prevMarkdown: string) => void>;
                destroy: Array<(ctx: unknown) => void>;
            };
            markdownUpdated: (fn: (ctx: unknown, markdown: string, prevMarkdown: string) => void) => void;
            destroy: (fn: (ctx: unknown) => void) => void;
        };
        private markdown = '';

        constructor(options: Record<string, any>) {
            this.options = options;
            this.markdown = options.defaultValue;
            this.mockView = {
                dom: document.createElement('div'),
                state: {
                    doc: {
                        descendants: (callback: (node: { isText: boolean; text: string }, pos: number) => boolean) => {
                            callback({ isText: true, text: this.markdown }, 1);
                        }
                    }
                },
                setProps: vi.fn(),
                updateState: vi.fn()
            };
            this.editor = {
                action: vi.fn((callback: (ctx: { get: (slice: symbol) => typeof this.mockView; isInjected: (slice: symbol) => boolean }) => void) => {
                    callback({
                        isInjected: () => this.injectedEditorView,
                        get: () => this.mockView
                    });
                })
            };
            this.setReadonly = vi.fn();
            const markdownUpdated: Array<(ctx: unknown, markdown: string, prevMarkdown: string) => void> = [];
            const destroy: Array<(ctx: unknown) => void> = [];
            this.listenerManager = {
                listeners: {
                    markdownUpdated,
                    destroy
                },
                markdownUpdated: (fn) => {
                    markdownUpdated.push(fn);
                },
                destroy: (fn) => {
                    destroy.push(fn);
                }
            };
            crepeInstances.push(this);
        }

        on(fn?: (listener: MockCrepe['listenerManager']) => void) {
            fn?.(this.listenerManager);
            return this;
        }

        async create() {
            return undefined;
        }

        async destroy() {
            this.listenerManager.listeners.destroy.forEach((fn) => fn({}));
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

vi.mock('@milkdown/kit/core', () => ({
    editorViewCtx: Symbol('editorViewCtx')
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
        const { createMarkdownEditor, createMarkdownBlockRenderConfig, readMarkdownDocument } = await import('./markdownDocument');
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
        expect(createMarkdownBlockRenderConfig('viewer').enabledFeatures.table).toBe(true);
        expect(readMarkdownDocument(editor)).toBe(content);
    });

    it('falls back to table source editing in edit mode', async () => {
        const { createMarkdownEditor, createMarkdownBlockRenderConfig, readMarkdownDocument, resolveMarkdownBlockRenderer } = await import('./markdownDocument');
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
        expect(crepeOptions?.features?.table).toBe(false);
        expect(createMarkdownBlockRenderConfig('edit').enabledFeatures.table).toBe(false);
        expect(resolveMarkdownBlockRenderer('edit', 'table').name).toBe('source');
        expect(readMarkdownDocument(editor)).toBe(content);
    });

    it('keeps placeholders disabled only for viewer mode without forcing the editor readonly', async () => {
        const { createMarkdownBlockRenderConfig, createMarkdownEditor } = await import('./markdownDocument');
        const root = document.createElement('div');

        await createMarkdownEditor({
            root,
            content: '# Viewer',
            mode: 'viewer',
            documentPath: '/notes/viewer.md',
            onChange: vi.fn()
        });

        const viewerInstance = mocks.crepeInstances.at(-1);
        expect(viewerInstance?.setReadonly).not.toHaveBeenCalled();
        expect(createMarkdownBlockRenderConfig('viewer').enabledFeatures.placeholder).toBe(false);
        expect(createMarkdownBlockRenderConfig('edit').enabledFeatures.placeholder).toBe(true);
    });

    it('enables list item checkboxes while keeping the other blocked features unchanged', async () => {
        const { createMarkdownBlockRenderConfig, createMarkdownEditor } = await import('./markdownDocument');
        const root = document.createElement('div');

        await createMarkdownEditor({
            root,
            content: '- [ ] task',
            mode: 'edit',
            documentPath: '/notes/task.md',
            onChange: vi.fn()
        });

        const crepeOptions = mocks.crepeInstances.at(-1)?.options;
        expect(crepeOptions?.features?.['list-item']).toBe(true);
        expect(createMarkdownBlockRenderConfig('viewer').enabledFeatures['list-item']).toBe(true);
        expect(createMarkdownBlockRenderConfig('edit').enabledFeatures['list-item']).toBe(true);
        expect(createMarkdownBlockRenderConfig('viewer').enabledFeatures['block-edit']).toBe(false);
        expect(createMarkdownBlockRenderConfig('viewer').enabledFeatures.latex).toBe(false);
        expect(createMarkdownBlockRenderConfig('viewer').enabledFeatures['link-tooltip']).toBe(false);
        expect(createMarkdownBlockRenderConfig('viewer').enabledFeatures.toolbar).toBe(false);
    });

    it('removes markdownUpdated listeners before editor destroy to avoid late serialization after teardown', async () => {
        const { createMarkdownEditor, destroyMarkdownEditor } = await import('./markdownDocument');
        const root = document.createElement('div');

        const editor = await createMarkdownEditor({
            root,
            content: '# Viewer',
            mode: 'viewer',
            documentPath: '/notes/viewer.md',
            onChange: vi.fn()
        });

        const crepeInstance = mocks.crepeInstances.at(-1);
        expect(crepeInstance?.listenerManager.listeners.markdownUpdated).toHaveLength(1);

        await destroyMarkdownEditor(editor);

        expect(crepeInstance?.listenerManager.listeners.markdownUpdated).toHaveLength(0);
    });

    it('wires Mermaid preview only in viewer mode', async () => {
        const { createMarkdownEditor, resolveMarkdownBlockRenderer } = await import('./markdownDocument');
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
        expect(resolveMarkdownBlockRenderer('viewer', 'mermaid').name).toBe('mermaid-preview');
        expect(mocks.renderMermaidPreview).toHaveBeenCalledTimes(1);
        expect(mocks.renderMermaidPreview).toHaveBeenCalledWith('mermaid', 'graph TD;', applyPreview);
        expect(codeMirrorConfig.renderPreview('ts', 'const value = 1;', applyPreview)).toBeNull();
    });

    it('keeps Mermaid source editable in edit mode', async () => {
        const { createMarkdownEditor, resolveMarkdownBlockRenderer } = await import('./markdownDocument');
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
        expect(resolveMarkdownBlockRenderer('edit', 'mermaid').name).toBe('source');
        expect(codeMirrorConfig.renderPreview('mermaid', 'graph TD;', applyPreview)).toBeNull();
    });

    it('renders PDF embed previews as stable block nodes in viewer mode', async () => {
        const { createMarkdownEditor, detectMarkdownBlockType } = await import('./markdownDocument');
        const root = document.createElement('div');
        const applyPreview = vi.fn();

        await createMarkdownEditor({
            root,
            content: '![[guide.pdf]]',
            mode: 'viewer',
            documentPath: '/notes/current.md',
            onChange: vi.fn()
        });

        const codeMirrorConfig = mocks.crepeInstances.at(-1)?.options.featureConfigs['code-mirror'];
        const preview = codeMirrorConfig.renderPreview(
            'cp-pdf-embed',
            JSON.stringify({ label: 'guide.pdf', candidates: ['references/guide.pdf'] }),
            applyPreview
        );
        expect(detectMarkdownBlockType('cp-pdf-embed', '')).toBe('pdf-embed');
        expect(preview).toBeInstanceOf(HTMLElement);
        expect((preview as HTMLElement).className).toBe('markdown-pdf-embed');
        expect((preview as HTMLElement).querySelector('.markdown-pdf-embed__link')).toBeNull();
        expect((preview as HTMLElement).dataset.pdfCandidates).toBe('["references/guide.pdf"]');
        expect((preview as HTMLElement).dataset.pdfLabel).toBe('guide.pdf');
    });

    it('uses source rendering as the default fallback for unconfigured code blocks', async () => {
        const {
            createMarkdownBlockRenderConfig,
            detectMarkdownBlockType,
            resolveMarkdownBlockRenderer,
        } = await import('./markdownDocument');

        expect(detectMarkdownBlockType('ts', 'const value = 1;')).toBe('default-code');
        expect(resolveMarkdownBlockRenderer('viewer', 'default-code').name).toBe('source');
        expect(resolveMarkdownBlockRenderer('edit', 'default-code').name).toBe('source');
        expect(createMarkdownBlockRenderConfig('viewer').codeBlocks['default-code'].viewRenderer.name).toBe('source');
        expect(createMarkdownBlockRenderConfig('viewer').codeBlocks.table.viewRenderer.name).toBe('markdown-table-preview');
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
        // wiki embeds → renderable images keep current references behavior, pdf embeds prefer same-directory and
        // fall back to references/, others become links
        expect(normalizeMarkdownViewerContent('![[flow.svg]]')).toBe('![flow.svg](references/flow.svg)');
        expect(normalizeMarkdownViewerContent('![[Pasted image 20260405095014.png]]')).toBe(
            '![Pasted image 20260405095014.png](references/Pasted%20image%2020260405095014.png)'
        );
        expect(normalizeMarkdownViewerContent('![[references/flow.svg]]')).toBe('![flow.svg](references/flow.svg)');
        expect(normalizeMarkdownViewerContent('![[Customer_Transactions_4047340.pdf]]')).toBe([
            '```cp-pdf-embed',
            '{"label":"Customer_Transactions_4047340.pdf","candidates":["Customer_Transactions_4047340.pdf","references/Customer_Transactions_4047340.pdf"],"showLink":false}',
            '```'
        ].join('\n'));
        expect(normalizeMarkdownViewerContent('![[./Customer_Transactions_4047340.pdf]]')).toBe([
            '```cp-pdf-embed',
            '{"label":"Customer_Transactions_4047340.pdf","candidates":["./Customer_Transactions_4047340.pdf"],"showLink":false}',
            '```'
        ].join('\n'));
        expect(normalizeMarkdownViewerContent('![[references/Customer_Transactions_4047340.pdf]]')).toBe([
            '```cp-pdf-embed',
            '{"label":"Customer_Transactions_4047340.pdf","candidates":["references/Customer_Transactions_4047340.pdf"],"showLink":false}',
            '```'
        ].join('\n'));
        // standard markdown image syntax: references/ prefix never added — paths are document-relative
        expect(normalizeMarkdownViewerContent('![PDF preview](references/Customer_Transactions_4047340.pdf)')).toBe([
            '```cp-pdf-embed',
            '{"label":"PDF preview","candidates":["references/Customer_Transactions_4047340.pdf"],"showLink":false}',
            '```'
        ].join('\n'));
        // standard relative image — must NOT get references/ prepended
        expect(normalizeMarkdownViewerContent('![diagram](./images/flow.png)')).toBe('![diagram](./images/flow.png)');
        expect(normalizeMarkdownViewerContent('![diagram](images/flow.png)')).toBe('![diagram](images/flow.png)');
        // HTML img is normalized to Crepe's markdown image form. Width is dropped because
        // Crepe ImageBlock treats the alt slot as a numeric ratio, not arbitrary text;
        // the previous numeric alt ("1.00") is preserved as the ratio.
        expect(normalizeMarkdownViewerContent('<img src="references/Pasted%20image%2020260508103448.png" alt="1.00" width="545" />')).toBe(
            '![1.00](references/Pasted%20image%2020260508103448.png)'
        );
        // Non-numeric legacy alt collapses to empty (Crepe parseMarkdown would coerce it
        // to ratio=1 anyway); width attribute is also dropped.
        expect(normalizeMarkdownViewerContent('<img src="references/foo.png" alt="legacy text" width="600" />')).toBe(
            '![](references/foo.png)'
        );
        // pdf image syntax remains explicit embed
        expect(normalizeMarkdownViewerContent('![report](./report.pdf)')).toBe([
            '```cp-pdf-embed',
            '{"label":"report","candidates":["./report.pdf"],"showLink":false}',
            '```'
        ].join('\n'));
    });

    it('builds and parses conversation-only markdown hrefs', async () => {
        const { buildMarkdownConversationLinkHref, resolveMarkdownConversationLinkTarget } = await import('./markdownDocument');

        expect(buildMarkdownConversationLinkHref('conversation 1')).toBe('chatprism://conversation/conversation%201');
        expect(resolveMarkdownConversationLinkTarget('chatprism://conversation/conversation%201')).toEqual({
            conversationId: 'conversation 1'
        });
        expect(resolveMarkdownConversationLinkTarget('chatprism://conversation/')).toBeNull();
        expect(resolveMarkdownConversationLinkTarget('./guide.md')).toBeNull();
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

    it('routes pdf document links to the workspace callback instead of opening a new tab', async () => {
        const { createMarkdownEditor, destroyMarkdownEditor, resolveMarkdownDocumentLinkPath } = await import('./markdownDocument');
        const root = document.createElement('div');
        root.innerHTML = '<div contenteditable="true"><p><a href="./guide.pdf">guide.pdf</a></p></div>';
        const open = vi.spyOn(window, 'open').mockReturnValue(null);
        const onOpenDocumentLink = vi.fn();

        expect(resolveMarkdownDocumentLinkPath('./guide.pdf', '/notes/current.md')).toBe('/notes/guide.pdf');

        const editor = await createMarkdownEditor({
            root,
            content: '[guide.pdf](./guide.pdf)',
            mode: 'viewer',
            documentPath: '/notes/current.md',
            onOpenDocumentLink,
            onChange: vi.fn()
        });

        const anchor = root.querySelector<HTMLAnchorElement>('a[href="./guide.pdf"]');
        anchor?.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true
        }));

        expect(onOpenDocumentLink).toHaveBeenCalledWith('/notes/guide.pdf');
        expect(open).not.toHaveBeenCalled();

        await destroyMarkdownEditor(editor);
        open.mockRestore();
    });

    it('keeps ordinary pdf markdown links as links instead of converting them into embeds', async () => {
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

        expect(root.querySelector<HTMLAnchorElement>('a[href="references/guide.pdf"]')).not.toBeNull();
        expect(root.querySelectorAll('.markdown-pdf-embed')).toHaveLength(0);

        await destroyMarkdownEditor(editor);
    });

    it('routes markdown document links to the workspace callback instead of opening a new tab', async () => {
        const { buildRelativeMarkdownLinkPath, createMarkdownEditor, destroyMarkdownEditor, resolveMarkdownDocumentLinkPath } = await import('./markdownDocument');
        const root = document.createElement('div');
        root.innerHTML = '<div contenteditable="true"><p><a href="./guide.md">guide.md</a></p></div>';
        const open = vi.spyOn(window, 'open').mockReturnValue(null);
        const onOpenDocumentLink = vi.fn();

        expect(resolveMarkdownDocumentLinkPath('./guide.md', '/notes/current.md')).toBe('/notes/guide.md');
        expect(buildRelativeMarkdownLinkPath('/notes/current.md', '/notes/guide.md')).toBe('guide.md');
        expect(buildRelativeMarkdownLinkPath('/notes/current.md', '/notes/archive/guide.md')).toBe('archive/guide.md');
        expect(buildRelativeMarkdownLinkPath('/notes/current.md', '/guide.md')).toBe('../guide.md');

        const editor = await createMarkdownEditor({
            root,
            content: '[guide.md](./guide.md)',
            mode: 'viewer',
            documentPath: '/notes/current.md',
            onOpenDocumentLink,
            onChange: vi.fn()
        });

        const anchor = root.querySelector<HTMLAnchorElement>('a[href="./guide.md"]');
        anchor?.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true
        }));

        expect(onOpenDocumentLink).toHaveBeenCalledWith('/notes/guide.md');
        expect(open).not.toHaveBeenCalled();

        await destroyMarkdownEditor(editor);
        open.mockRestore();
    });

    it('captures render selections from simple text blocks and resolves them back into markdown source offsets', async () => {
        const { captureRenderableMarkdownSelection, resolveMarkdownSourceSelection } = await import('./markdownDocument');
        const root = document.createElement('div');
        root.innerHTML = '<div class="milkdown"><div class="ProseMirror"><p>Intro target</p></div></div>';
        document.body.append(root);

        const textNode = root.querySelector('p')?.firstChild;
        expect(textNode).not.toBeNull();
        const selection = window.getSelection();
        const range = document.createRange();
        range.setStart(textNode!, 6);
        range.setEnd(textNode!, 12);
        selection?.removeAllRanges();
        selection?.addRange(range);

        const snapshot = captureRenderableMarkdownSelection(root);
        expect(snapshot).toEqual({
            blockText: 'Intro target',
            start: 6,
            end: 12,
            selectedText: 'target'
        });
        expect(resolveMarkdownSourceSelection('Intro target', snapshot!)).toEqual({
            start: 6,
            end: 12
        });
    });

    it('finds a unique local markdown image source and rewrites the ratio in Crepe markdown image form', async () => {
        const {
            findResizableMarkdownImageSource,
            rewriteMarkdownImageRatio,
            resolveMarkdownImageUrl
        } = await import('./markdownDocument');
        const markdown = 'Intro\n\n![Diagram](./images/flow.png)\n';
        const renderedSrc = resolveMarkdownImageUrl('./images/flow.png', '/notes/guide.md');

        const match = findResizableMarkdownImageSource(markdown, renderedSrc, '/notes/guide.md');
        expect(match).toEqual({
            start: 7,
            end: 36,
            kind: 'markdown-image',
            raw: '![Diagram](./images/flow.png)'
        });
        expect(rewriteMarkdownImageRatio(markdown, match!, 1.5)).toBe(
            'Intro\n\n![1.50](./images/flow.png)\n'
        );
    });

    it('rewrites html image source into Crepe markdown ratio form and preserves unsupported ambiguous sources', async () => {
        const {
            findResizableMarkdownImageSource,
            rewriteMarkdownImageRatio,
            resolveMarkdownImageUrl
        } = await import('./markdownDocument');
        const htmlMarkdown = '<img src="./images/flow.png" alt="Flow" width="120" />';
        const renderedSrc = resolveMarkdownImageUrl('./images/flow.png', '/notes/guide.md');
        const htmlMatch = findResizableMarkdownImageSource(htmlMarkdown, renderedSrc, '/notes/guide.md');

        expect(htmlMatch?.kind).toBe('html-image');
        expect(rewriteMarkdownImageRatio(htmlMarkdown, htmlMatch!, 0.75)).toBe(
            '![0.75](./images/flow.png)'
        );

        const ambiguousMarkdown = '![A](./images/flow.png)\n![B](./images/flow.png)';
        expect(findResizableMarkdownImageSource(ambiguousMarkdown, renderedSrc, '/notes/guide.md')).toBeNull();
        expect(findResizableMarkdownImageSource('![Remote](https://example.com/flow.png)', 'https://example.com/flow.png', '/notes/guide.md')).toBeNull();
        expect(findResizableMarkdownImageSource('![Inline](data:image/png;base64,abc)', 'data:image/png;base64,abc', '/notes/guide.md')).toBeNull();
    });

    it('rewrites wiki image embeds into Crepe markdown ratio form and builds deterministic pasted image references', async () => {
        const {
            buildPastedMarkdownImagePath,
            buildRelativeMarkdownImageReference,
            findResizableMarkdownImageSource,
            insertPastedMarkdownImage,
            resolveMarkdownImageUrl,
            rewriteMarkdownImageRatio
        } = await import('./markdownDocument');
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-08T12:34:56Z'));

        const wikiMarkdown = '![[flow.svg|Flow diagram]]';
        const wikiRenderedSrc = resolveMarkdownImageUrl('references/flow.svg', '/notes/guide.md');
        const wikiMatch = findResizableMarkdownImageSource(wikiMarkdown, wikiRenderedSrc, '/notes/guide.md');
        expect(wikiMatch?.kind).toBe('wiki-image');
        expect(rewriteMarkdownImageRatio(wikiMarkdown, wikiMatch!, 1.25)).toBe(
            '![1.25](references/flow.svg)'
        );

        const takenPaths = new Set<string>(['/notes/references/Pasted image 20260508083456.png']);
        expect(buildPastedMarkdownImagePath('/notes/guide.md', 'image/png', takenPaths)).toBe(
            '/notes/references/Pasted image 20260508083456 2.png'
        );
        expect(buildRelativeMarkdownImageReference('/notes/guide.md', '/notes/references/Pasted image 20260508083456 2.png')).toBe(
            '![](references/Pasted%20image%2020260508083456%202.png)'
        );
        expect(insertPastedMarkdownImage('Hello world', { start: 6, end: 11 }, '![](references/pasted.png)')).toBe(
            'Hello ![](references/pasted.png)'
        );
    });


    it('updates markdown editor search state through editor view decorations', async () => {
        const {
            createMarkdownEditor,
            getMarkdownEditorSearchMatchCount,
            scrollToMarkdownEditorSearchMatch,
            setMarkdownEditorActiveSearchMatchIndex,
            setMarkdownEditorSearchQuery
        } = await import('./markdownDocument');
        const root = document.createElement('div');

        const editor = await createMarkdownEditor({
            root,
            content: 'Alpha beta Alpha',
            mode: 'viewer',
            documentPath: '/notes/search.md',
            onChange: vi.fn()
        });
        const crepeInstance = mocks.crepeInstances.at(-1);
        expect(crepeInstance?.mockView.setProps).toHaveBeenCalled();

        const scrollIntoView = vi.fn();
        const mark = document.createElement('mark');
        mark.className = 'markdown-search-highlight';
        mark.dataset.matchIndex = '1';
        mark.scrollIntoView = scrollIntoView;
        crepeInstance?.mockView.dom.append(mark);

        setMarkdownEditorSearchQuery(editor, 'alpha');
        expect(getMarkdownEditorSearchMatchCount(editor)).toBe(2);
        expect(crepeInstance?.mockView.updateState).toHaveBeenCalled();

        setMarkdownEditorActiveSearchMatchIndex(editor, 1);
        expect(getMarkdownEditorSearchMatchCount(editor)).toBe(2);

        scrollToMarkdownEditorSearchMatch(editor, 1);
        expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    });

    it('skips editor-view dependent search helpers when editorView context is not injected', async () => {
        const {
            createMarkdownEditor,
            getMarkdownEditorSearchMatchCount,
            scrollToMarkdownEditorSearchMatch,
            setMarkdownEditorActiveSearchMatchIndex,
            setMarkdownEditorSearchQuery
        } = await import('./markdownDocument');
        const root = document.createElement('div');

        const editor = await createMarkdownEditor({
            root,
            content: 'Alpha beta Alpha',
            mode: 'viewer',
            documentPath: '/notes/search-missing-view.md',
            onChange: vi.fn()
        });

        const crepeInstance = mocks.crepeInstances.at(-1);
        expect(crepeInstance).toBeDefined();
        crepeInstance!.injectedEditorView = false;

        expect(() => setMarkdownEditorSearchQuery(editor, 'alpha')).not.toThrow();
        expect(() => setMarkdownEditorActiveSearchMatchIndex(editor, 1)).not.toThrow();
        expect(() => scrollToMarkdownEditorSearchMatch(editor, 1)).not.toThrow();
        expect(getMarkdownEditorSearchMatchCount(editor)).toBe(0);
        expect(crepeInstance?.mockView.updateState).not.toHaveBeenCalled();
    });
});
