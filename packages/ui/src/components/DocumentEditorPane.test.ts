// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';

enableAutoUnmount(afterEach);
import { encodeTextDocument } from '@packages/core/src';

const createMarkdownEditor = vi.fn();
const replaceMarkdownDocument = vi.fn();
const readMarkdownDocument = vi.fn();
const destroyMarkdownEditor = vi.fn();
const normalizeMarkdownViewerContent = vi.fn((content: string) => content.replace(
    /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_match: string, target: string, alias?: string) => {
        const normalizedTarget = target.trim().replace(/^\/+/, '');
        const resolvedTarget = normalizedTarget.startsWith('references/')
            ? normalizedTarget
            : `references/${normalizedTarget}`;
        const trimmedAlias = alias?.trim();
        return trimmedAlias ? `![${trimmedAlias}](${resolvedTarget})` : `![](${resolvedTarget})`;
    }
));
const setMarkdownEditorSearchQuery = vi.fn((editor: { __search?: { query: string; activeIndex: number; matchCount: number }; __applySearchHighlights?: () => void }, query: string) => {
    editor.__search = {
        query,
        activeIndex: 0,
        matchCount: editor.__search?.matchCount ?? 0
    };
    editor.__applySearchHighlights?.();
});
const setMarkdownEditorActiveSearchMatchIndex = vi.fn((editor: { __search?: { query: string; activeIndex: number; matchCount: number }; __applySearchHighlights?: () => void }, index: number) => {
    if (!editor.__search) {
        editor.__search = {
            query: '',
            activeIndex: index,
            matchCount: 0
        };
    } else {
        editor.__search.activeIndex = index;
    }
    editor.__applySearchHighlights?.();
});
const getMarkdownEditorSearchMatchCount = vi.fn((editor: { __search?: { matchCount: number } }) => editor.__search?.matchCount ?? 0);
const scrollToMarkdownEditorSearchMatch = vi.fn();
const createObjectURL = vi.fn(() => 'blob:pdf-preview');
const revokeObjectURL = vi.fn();

vi.mock('../utils/markdownDocument', () => ({
    createMarkdownEditor,
    replaceMarkdownDocument,
    readMarkdownDocument,
    destroyMarkdownEditor,
    normalizeMarkdownViewerContent,
    setMarkdownEditorSearchQuery,
    setMarkdownEditorActiveSearchMatchIndex,
    getMarkdownEditorSearchMatchCount,
    scrollToMarkdownEditorSearchMatch
}));

describe('DocumentEditorPane', () => {
    beforeEach(() => {
        createMarkdownEditor.mockReset();
        replaceMarkdownDocument.mockReset();
        readMarkdownDocument.mockReset();
        destroyMarkdownEditor.mockReset();
        normalizeMarkdownViewerContent.mockClear();
        setMarkdownEditorSearchQuery.mockClear();
        setMarkdownEditorActiveSearchMatchIndex.mockClear();
        getMarkdownEditorSearchMatchCount.mockClear();
        scrollToMarkdownEditorSearchMatch.mockClear();
        createObjectURL.mockClear();
        revokeObjectURL.mockClear();
        vi.stubGlobal('URL', {
            createObjectURL,
            revokeObjectURL
        });
    });

    it('shows the active agent name in the middle pane title area', async () => {
        const { default: DocumentEditorPane } = await import('./DocumentEditorPane.vue');
        const wrapper = mount(DocumentEditorPane, {
            props: {
                activePath: '/docs/guide.md',
                activeAgentName: 'Docs Agent',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: encodeTextDocument('# Guide'),
                    canWrite: true
                },
                activeViewerId: 'text',
                activePaneMode: 'viewer',
                modelValue: '# Guide',
                isSaving: false,
                isDirty: false,
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false
            }
        });

        await wrapper.vm.$nextTick();

        expect(wrapper.get('[data-testid="document-editor-title"]').text()).toBe('Docs Agent / guide.md');
    });

    it('creates a Milkdown-backed editor and emits markdown updates', async () => {
        let onChange: ((markdown: string) => void) | undefined;
        const editor = { content: '# Today' };
        createMarkdownEditor.mockImplementation(async (options: { onChange: (markdown: string) => void }) => {
            onChange = options.onChange;
            return editor;
        });
        readMarkdownDocument.mockImplementation((value: { content: string }) => value.content);

        const { default: DocumentEditorPane } = await import('./DocumentEditorPane.vue');
        const wrapper = mount(DocumentEditorPane, {
            props: {
                activePath: '/notes/today.md',
                activeDocument: {
                    path: '/notes/today.md',
                    mimeType: 'text/markdown',
                    dataBase64: encodeTextDocument('# Today'),
                    canWrite: true
                },
                activeViewerId: 'text',
                activePaneMode: 'viewer',
                modelValue: '# Today',
                isSaving: false,
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false
            }
        });

        await Promise.resolve();
        await wrapper.vm.$nextTick();

        expect(createMarkdownEditor).toHaveBeenCalledTimes(1);
        expect(createMarkdownEditor).toHaveBeenCalledWith(expect.objectContaining({
            mode: 'viewer',
            documentPath: '/notes/today.md'
        }));
        const modeToggle = wrapper.get('[data-testid="markdown-mode-toggle"]');
        expect(modeToggle.attributes('aria-label')).toBe('Edit');
        expect(modeToggle.html()).toContain('lucide-pencil-line');
        onChange?.('# Updated');
        await wrapper.vm.$nextTick();

        expect(wrapper.emitted('update:modelValue')).toEqual([[ '# Updated' ]]);
    });

    it('switches from markdown viewer to edit without serializing preview content', async () => {
        const firstEditor = { content: '# Draft from preview dom' };
        createMarkdownEditor.mockResolvedValueOnce(firstEditor);
        readMarkdownDocument.mockImplementation((value: { content: string }) => value.content);

        const { default: DocumentEditorPane } = await import('./DocumentEditorPane.vue');
        const wrapper = mount(DocumentEditorPane, {
            props: {
                activePath: '/docs/guide.md',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: encodeTextDocument('# Draft'),
                    canWrite: true
                },
                activeViewerId: 'text',
                activePaneMode: 'viewer',
                modelValue: '# Draft',
                isSaving: false,
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false
            }
        });

        await Promise.resolve();
        await wrapper.vm.$nextTick();

        await wrapper.get('[data-testid="markdown-mode-toggle"]').trigger('click');
        await Promise.resolve();
        await wrapper.vm.$nextTick();
        await Promise.resolve();
        await wrapper.vm.$nextTick();

        const modeToggle = wrapper.get('[data-testid="markdown-mode-toggle"]');
        expect(modeToggle.attributes('aria-label')).toBe('View');
        expect(modeToggle.html()).toContain('lucide-eye');
        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
        expect(destroyMarkdownEditor).toHaveBeenCalledWith(firstEditor);
        expect(createMarkdownEditor).toHaveBeenCalledTimes(1);
        expect(wrapper.get('[data-testid="document-editor-input"]').element).toHaveProperty('value', '# Draft');
    });

    it('normalizes wiki-style image embeds to references when rendering markdown viewer content', async () => {
        const editor = { content: '# Draft' };
        createMarkdownEditor.mockResolvedValue(editor);
        readMarkdownDocument.mockImplementation((value: { content: string }) => value.content);

        const { default: DocumentEditorPane } = await import('./DocumentEditorPane.vue');
        mount(DocumentEditorPane, {
            props: {
                activePath: '/docs/guide.md',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: encodeTextDocument('![[flow.svg]]'),
                    canWrite: true
                },
                activeViewerId: 'text',
                activePaneMode: 'viewer',
                modelValue: '![[flow.svg]]',
                isSaving: false,
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false
            }
        });

        await Promise.resolve();
        await Promise.resolve();

        expect(createMarkdownEditor).toHaveBeenCalledWith(expect.objectContaining({
            content: '![](references/flow.svg)',
            mode: 'viewer',
            documentPath: '/docs/guide.md'
        }));
    });

    it('does not emit update:modelValue when viewer-mode normalisation is the only change', async () => {
        let capturedOnChange: ((markdown: string) => void) | undefined;
        const editor = { content: '![](references/flow.svg)' };
        createMarkdownEditor.mockImplementation(async (options: { onChange: (m: string) => void }) => {
            capturedOnChange = options.onChange;
            return editor;
        });
        readMarkdownDocument.mockImplementation((value: { content: string }) => value.content);

        const { default: DocumentEditorPane } = await import('./DocumentEditorPane.vue');
        const wrapper = mount(DocumentEditorPane, {
            props: {
                activePath: '/docs/guide.md',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: encodeTextDocument('![[flow.svg]]'),
                    canWrite: true
                },
                activeViewerId: 'text',
                activePaneMode: 'viewer',
                modelValue: '![[flow.svg]]',
                isSaving: false,
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false
            }
        });

        await Promise.resolve();
        await wrapper.vm.$nextTick();

        // Simulate Milkdown firing onChange with the normalised content — should be suppressed.
        capturedOnChange?.('![](references/flow.svg)');
        await wrapper.vm.$nextTick();

        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    });

    it('passes original modelValue (not normalised content) to edit mode when switching from viewer', async () => {
        let capturedOnChange: ((markdown: string) => void) | undefined;
        const firstEditor = { content: '![](references/flow.svg)' };
        createMarkdownEditor
            .mockResolvedValueOnce(firstEditor);
        createMarkdownEditor.mockImplementationOnce(async (options: { onChange: (m: string) => void }) => {
            capturedOnChange = options.onChange;
            return firstEditor;
        });
        readMarkdownDocument.mockImplementation((value: { content: string }) => value.content);

        const { default: DocumentEditorPane } = await import('./DocumentEditorPane.vue');
        const wrapper = mount(DocumentEditorPane, {
            props: {
                activePath: '/docs/guide.md',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: encodeTextDocument('![[flow.svg]]'),
                    canWrite: true
                },
                activeViewerId: 'text',
                activePaneMode: 'viewer',
                modelValue: '![[flow.svg]]',
                isSaving: false,
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false
            }
        });

        await Promise.resolve();
        await wrapper.vm.$nextTick();

        // Viewer onChange fires with normalised content — should NOT pollute lastKnownMarkdown
        // in a way that switches edit mode to normalised content.
        capturedOnChange?.('![](references/flow.svg)');

        await wrapper.get('[data-testid="markdown-mode-toggle"]').trigger('click');
        await Promise.resolve();
        await wrapper.vm.$nextTick();
        await Promise.resolve();
        await wrapper.vm.$nextTick();

        // Edit mode must receive the original wiki-embed source, not the display-normalised form.
        expect(wrapper.get('[data-testid="document-editor-input"]').element).toHaveProperty('value', '![[flow.svg]]');
    });

    it('switches from markdown edit to viewer with current editor content', async () => {
        const firstEditor = { content: '# Draft' };
        createMarkdownEditor
            .mockResolvedValueOnce(firstEditor)
            .mockResolvedValueOnce({ content: '# Draft from editor' });
        readMarkdownDocument.mockImplementation((value: { content: string }) => value.content);

        const { default: DocumentEditorPane } = await import('./DocumentEditorPane.vue');
        const wrapper = mount(DocumentEditorPane, {
            props: {
                activePath: '/docs/guide.md',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: encodeTextDocument('# Draft'),
                    canWrite: true
                },
                activeViewerId: 'text',
                activePaneMode: 'viewer',
                modelValue: '# Draft',
                isSaving: false,
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false
            }
        });

        await Promise.resolve();
        await wrapper.vm.$nextTick();

        await wrapper.get('[data-testid="markdown-mode-toggle"]').trigger('click');
        await Promise.resolve();
        await wrapper.vm.$nextTick();
        await Promise.resolve();
        await wrapper.vm.$nextTick();

        await wrapper.get('[data-testid="document-editor-input"]').setValue('# Draft from editor');
        await wrapper.get('[data-testid="markdown-mode-toggle"]').trigger('click');
        await Promise.resolve();
        await wrapper.vm.$nextTick();
        await Promise.resolve();
        await wrapper.vm.$nextTick();

        expect(wrapper.emitted('update:modelValue')).toEqual([[ '# Draft from editor' ]]);
        expect(destroyMarkdownEditor).toHaveBeenCalledWith(firstEditor);
        expect(createMarkdownEditor).toHaveBeenCalledTimes(2);
        expect(createMarkdownEditor.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
            content: '# Draft from editor',
            mode: 'viewer',
            documentPath: '/docs/guide.md'
        }));
    });

    it('does not mutate markdown content when toggling modes without edits', async () => {
        const firstEditor = { content: '| Name | Type |\n| --- | --- |\n| id | string |' };
        createMarkdownEditor
            .mockResolvedValueOnce(firstEditor)
            .mockResolvedValueOnce({ content: '| Name | Type |\n| --- | --- |\n| id | string |' });
        readMarkdownDocument.mockImplementation((value: { content: string }) => value.content);

        const { default: DocumentEditorPane } = await import('./DocumentEditorPane.vue');
        const wrapper = mount(DocumentEditorPane, {
            props: {
                activePath: '/docs/table.md',
                activeDocument: {
                    path: '/docs/table.md',
                    mimeType: 'text/markdown',
                    dataBase64: encodeTextDocument('| Name | Type |\n| --- | --- |\n| id | string |'),
                    canWrite: true
                },
                activeViewerId: 'text',
                activePaneMode: 'viewer',
                modelValue: '| Name | Type |\n| --- | --- |\n| id | string |',
                isSaving: false,
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false
            }
        });

        await Promise.resolve();
        await wrapper.vm.$nextTick();

        await wrapper.get('[data-testid="markdown-mode-toggle"]').trigger('click');
        await Promise.resolve();
        await wrapper.vm.$nextTick();
        await Promise.resolve();
        await wrapper.vm.$nextTick();

        expect(wrapper.get('[data-testid="document-editor-input"]').element).toHaveProperty('value', '| Name | Type |\n| --- | --- |\n| id | string |');
        await wrapper.get('[data-testid="markdown-mode-toggle"]').trigger('click');
        await Promise.resolve();
        await wrapper.vm.$nextTick();
        await Promise.resolve();
        await wrapper.vm.$nextTick();

        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
        expect(createMarkdownEditor.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
            content: '| Name | Type |\n| --- | --- |\n| id | string |',
            mode: 'viewer'
        }));
    });

    it('does not show markdown mode controls for non-markdown text documents', async () => {
        const editor = { content: 'plain text' };
        createMarkdownEditor.mockResolvedValue(editor);
        readMarkdownDocument.mockImplementation((value: { content: string }) => value.content);

        const { default: DocumentEditorPane } = await import('./DocumentEditorPane.vue');
        const wrapper = mount(DocumentEditorPane, {
            props: {
                activePath: '/notes.txt',
                activeDocument: {
                    path: '/notes.txt',
                    mimeType: 'text/plain',
                    dataBase64: encodeTextDocument('plain text'),
                    canWrite: true
                },
                activeViewerId: 'text',
                activePaneMode: 'viewer',
                modelValue: 'plain text',
                isSaving: false,
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false
            }
        });

        await Promise.resolve();
        await wrapper.vm.$nextTick();

        expect(wrapper.find('[data-testid="markdown-mode-switch"]').exists()).toBe(false);
        expect(createMarkdownEditor).toHaveBeenCalledWith(expect.objectContaining({
            mode: 'edit',
            documentPath: '/notes.txt'
        }));
    });

    it('replaces editor content when the active document changes', async () => {
        const firstEditor = { content: '# Welcome' };
        createMarkdownEditor.mockResolvedValue(firstEditor);
        readMarkdownDocument.mockImplementation((value: { content: string }) => value.content);

        const { default: DocumentEditorPane } = await import('./DocumentEditorPane.vue');
        const wrapper = mount(DocumentEditorPane, {
            props: {
                activePath: '/welcome.md',
                activeDocument: {
                    path: '/welcome.md',
                    mimeType: 'text/markdown',
                    dataBase64: encodeTextDocument('# Welcome'),
                    canWrite: true
                },
                activeViewerId: 'text',
                activePaneMode: 'viewer',
                modelValue: '# Welcome',
                isSaving: false,
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false
            }
        });

        await Promise.resolve();
        await wrapper.vm.$nextTick();

        await wrapper.setProps({
            activePath: '/notes/today.md',
            activeDocument: {
                path: '/notes/today.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Today'),
                canWrite: true
            },
            modelValue: '# Today'
        });
        await Promise.resolve();
        await wrapper.vm.$nextTick();

        expect(replaceMarkdownDocument).toHaveBeenCalledWith(firstEditor, '# Today');
    });

    it('emits save and tears down the editor on unmount', async () => {
        const editor = { content: '# Draft' };
        createMarkdownEditor.mockResolvedValue(editor);
        readMarkdownDocument.mockImplementation((value: { content: string }) => value.content);

        const { default: DocumentEditorPane } = await import('./DocumentEditorPane.vue');
        const wrapper = mount(DocumentEditorPane, {
            props: {
                activePath: '/draft.md',
                activeDocument: {
                    path: '/draft.md',
                    mimeType: 'text/markdown',
                    dataBase64: encodeTextDocument('# Draft'),
                    canWrite: true
                },
                activeViewerId: 'text',
                activePaneMode: 'viewer',
                modelValue: '# Draft',
                isSaving: false,
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false
            }
        });

        await Promise.resolve();
        await wrapper.vm.$nextTick();

        expect(wrapper.get('[data-testid="document-save"]').attributes('title')).toBe('Save');
        expect(wrapper.get('[data-testid="document-save"]').attributes('aria-label')).toBe('Save');
        await wrapper.get('[data-testid="document-save"]').trigger('mouseenter');
        expect(document.body.textContent).toContain('Save');
        await wrapper.get('[data-testid="document-save"]').trigger('mouseleave');
        expect(document.body.textContent).not.toContain('Save');
        await wrapper.get('[data-testid="document-save"]').trigger('click');
        expect(wrapper.emitted('save')).toHaveLength(1);

        await wrapper.unmount();
        expect(destroyMarkdownEditor).toHaveBeenCalledWith(editor);
    });

    it('emits a middle pane toggle event from the header control', async () => {
        const editor = { content: '# Draft' };
        createMarkdownEditor.mockResolvedValue(editor);
        readMarkdownDocument.mockImplementation((value: { content: string }) => value.content);

        const { default: DocumentEditorPane } = await import('./DocumentEditorPane.vue');
        const wrapper = mount(DocumentEditorPane, {
            props: {
                activePath: '/draft.md',
                activeDocument: {
                    path: '/draft.md',
                    mimeType: 'text/markdown',
                    dataBase64: encodeTextDocument('# Draft'),
                    canWrite: true
                },
                activeViewerId: 'text',
                activePaneMode: 'viewer',
                modelValue: '# Draft',
                isSaving: false,
                isDirty: false,
                middlePaneMode: 'default',
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false
            }
        });

        await Promise.resolve();
        await wrapper.vm.$nextTick();
        await wrapper.get('[data-testid="document-middle-pane-toggle"]').trigger('click');

        expect(wrapper.emitted('toggle-middle-pane-mode')).toHaveLength(1);
    });

    it('keeps the title bar and editor shell outside the zoomed content surface', async () => {
        const editor = { content: '# Draft' };
        createMarkdownEditor.mockResolvedValue(editor);
        readMarkdownDocument.mockImplementation((value: { content: string }) => value.content);

        const { default: DocumentEditorPane } = await import('./DocumentEditorPane.vue');
        const wrapper = mount(DocumentEditorPane, {
            props: {
                activePath: '/draft.md',
                activeDocument: {
                    path: '/draft.md',
                    mimeType: 'text/markdown',
                    dataBase64: encodeTextDocument('# Draft'),
                    canWrite: true
                },
                activeViewerId: 'text',
                activePaneMode: 'viewer',
                modelValue: '# Draft',
                isSaving: false,
                middlePaneZoom: 1.5,
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false
            }
        });

        await Promise.resolve();
        await wrapper.vm.$nextTick();

        expect((wrapper.get('.editor-header').element as HTMLElement).hasAttribute('style')).toBe(false);
        expect(wrapper.get('.editor-surface').attributes('style')).toBeUndefined();
        expect(wrapper.get('[data-testid="document-editor-surface"]').attributes('style')).toContain('scale(1.5)');
    });

    it('creates and revokes blob urls when switching pdf documents', async () => {
        const { default: DocumentEditorPane } = await import('./DocumentEditorPane.vue');
        const wrapper = mount(DocumentEditorPane, {
            props: {
                activePath: '/docs/report.pdf',
                activeDocument: {
                    path: '/docs/report.pdf',
                    mimeType: 'application/pdf',
                    dataBase64: 'JVBERg==',
                    canWrite: false
                },
                activeViewerId: 'pdf',
                activePaneMode: 'viewer',
                modelValue: '',
                isSaving: false,
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false
            }
        });

        await wrapper.vm.$nextTick();

        expect(createObjectURL).toHaveBeenCalledTimes(1);
        expect(wrapper.get('[data-testid="document-pdf-viewer"] iframe').attributes('src')).toBe('blob:pdf-preview');

        await wrapper.setProps({
            activePath: '/notes/today.md',
            activeDocument: {
                path: '/notes/today.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Today'),
                canWrite: true
            },
            activeViewerId: 'text',
            modelValue: '# Today'
        });
        await Promise.resolve();
        await wrapper.vm.$nextTick();

        expect(revokeObjectURL).toHaveBeenCalledWith('blob:pdf-preview');
    });

    it('renders a visible pdf fallback entry when embedded preview is unavailable', async () => {
        createObjectURL.mockReturnValueOnce('');

        const { default: DocumentEditorPane } = await import('./DocumentEditorPane.vue');
        const wrapper = mount(DocumentEditorPane, {
            props: {
                activePath: '/docs/report.pdf',
                activeDocument: {
                    path: '/docs/report.pdf',
                    mimeType: 'application/pdf',
                    dataBase64: 'JVBERg==',
                    canWrite: false
                },
                activeViewerId: 'pdf',
                activePaneMode: 'viewer',
                modelValue: '',
                isSaving: false,
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false
            }
        });

        await wrapper.vm.$nextTick();

        expect(wrapper.get('[data-testid="document-pdf-fallback"]').text()).toContain('This environment does not support embedded PDF preview.');
        expect(wrapper.get('[data-testid="document-pdf-fallback"]').text()).toContain('Open PDF in a new tab');
        expect(wrapper.get('[data-testid="document-pdf-open-link"]').attributes('href')).toBe('data:application/pdf;base64,JVBERg==');
    });

    it('renders image documents as read-only data urls and clears image state after switching away', async () => {
        const { default: DocumentEditorPane } = await import('./DocumentEditorPane.vue');
        const wrapper = mount(DocumentEditorPane, {
            props: {
                activePath: '/images/flow.svg',
                activeDocument: {
                    path: '/images/flow.svg',
                    mimeType: 'image/svg+xml',
                    dataBase64: 'PHN2Zy8+',
                    canWrite: false
                },
                activeViewerId: 'image',
                activePaneMode: 'viewer',
                modelValue: '',
                isSaving: false,
                latestFileChange: {
                    id: 'image-change',
                    path: '/images/flow.svg',
                    beforeContent: '',
                    afterContent: '',
                    createdAt: 1
                },
                diffEntries: [
                    { kind: 'added', oldLineNumber: null, newLineNumber: 1, text: 'image change' }
                ],
                canUndo: true,
                canRedo: true
            }
        });

        const image = wrapper.get('[data-testid="document-image-viewer"] img');
        expect(image.attributes('src')).toBe('data:image/svg+xml;base64,PHN2Zy8+');
        expect(image.attributes('alt')).toBe('flow.svg');
        expect(wrapper.get('[data-testid="document-save"]').attributes('disabled')).toBeDefined();
        expect(wrapper.find('[data-testid="markdown-mode-switch"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="document-file-change"]').exists()).toBe(false);
        expect(createMarkdownEditor).not.toHaveBeenCalled();

        await wrapper.setProps({
            activePath: '/notes.txt',
            activeDocument: {
                path: '/notes.txt',
                mimeType: 'text/plain',
                dataBase64: encodeTextDocument('plain text'),
                canWrite: true
            },
            activeViewerId: 'text',
            modelValue: 'plain text',
            latestFileChange: null,
            diffEntries: [],
            canUndo: false,
            canRedo: false
        });
        await Promise.resolve();
        await wrapper.vm.$nextTick();

        expect(wrapper.find('[data-testid="document-image-viewer"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="document-editor-surface"]').exists()).toBe(true);
    });

    it('renders an unsupported state when no viewer matches the current mime type', async () => {
        const { default: DocumentEditorPane } = await import('./DocumentEditorPane.vue');
        const wrapper = mount(DocumentEditorPane, {
            props: {
                activePath: '/archive.bin',
                activeDocument: {
                    path: '/archive.bin',
                    mimeType: 'application/octet-stream',
                    dataBase64: 'AQID',
                    canWrite: false
                },
                activeViewerId: null,
                activePaneMode: 'unsupported',
                modelValue: '',
                isSaving: false,
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false
            }
        });

        expect(wrapper.get('[data-testid="document-unsupported-viewer"]').text()).toContain('application/octet-stream');
        expect(wrapper.get('[data-testid="document-save"]').attributes('disabled')).toBeDefined();
    });

    it('opens markdown viewer search with Ctrl+F and leaves unsupported viewers to browser search', async () => {
        createMarkdownEditor.mockImplementation(async (options: { root: HTMLElement }) => {
            options.root.innerHTML = '<div class="ProseMirror"><p>Alpha beta Alpha</p></div>';
            const editor = {
                content: 'Alpha beta Alpha',
                root: options.root,
                __search: {
                    query: '',
                    activeIndex: 0,
                    matchCount: 0
                },
                __applySearchHighlights() {
                    const proseMirror = options.root.querySelector('.ProseMirror');
                    if (!(proseMirror instanceof HTMLElement)) {
                        return;
                    }

                    proseMirror.innerHTML = '<p>Alpha beta Alpha</p>';
                    const query = editor.__search?.query.toLowerCase() ?? '';
                    if (!query) {
                        editor.__search!.matchCount = 0;
                        return;
                    }

                    proseMirror.innerHTML = `
                      <p>
                        <mark class="markdown-search-highlight markdown-search-highlight--active" data-match-index="0">Alpha</mark>
                        beta
                        <mark class="markdown-search-highlight" data-match-index="1">Alpha</mark>
                      </p>
                    `;
                    editor.__search!.matchCount = 2;
                }
            };
            return editor;
        });

        const { default: DocumentEditorPane } = await import('./DocumentEditorPane.vue');
        const wrapper = mount(DocumentEditorPane, {
            props: {
                activePath: '/notes/today.md',
                activeDocument: {
                    path: '/notes/today.md',
                    mimeType: 'text/markdown',
                    dataBase64: encodeTextDocument('Alpha beta Alpha'),
                    canWrite: true
                },
                activeViewerId: 'text',
                activePaneMode: 'viewer',
                modelValue: 'Alpha beta Alpha',
                isSaving: false,
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false
            },
            attachTo: document.body
        });
        await Promise.resolve();
        await wrapper.vm.$nextTick();

        const openEvent = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, cancelable: true });
        window.dispatchEvent(openEvent);
        await wrapper.vm.$nextTick();

        expect(openEvent.defaultPrevented).toBe(true);
        expect(wrapper.find('[data-testid="document-viewer-search"]').exists()).toBe(true);
        await wrapper.get('[data-testid="document-viewer-search-input"]').setValue('alpha');
        await wrapper.vm.$nextTick();
        expect(wrapper.get('[data-testid="document-viewer-search-count"]').text()).toContain('1/2');

        await wrapper.setProps({
            activePath: '/archive.bin',
            activeDocument: {
                path: '/archive.bin',
                mimeType: 'application/octet-stream',
                dataBase64: 'AQID',
                canWrite: false
            },
            activeViewerId: null,
            activePaneMode: 'unsupported',
            modelValue: ''
        });
        const browserFindEvent = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, cancelable: true });
        window.dispatchEvent(browserFindEvent);
        expect(browserFindEvent.defaultPrevented).toBe(false);
        wrapper.unmount();
    });

    it('highlights matches across inline formatting boundaries without throwing', async () => {
        createMarkdownEditor.mockImplementation(async (options: { root: HTMLElement }) => {
            options.root.innerHTML = '<div class="ProseMirror"><p><strong>pri</strong><em>mary</em></p></div>';
            const editor = {
                content: 'primary',
                root: options.root,
                __search: {
                    query: '',
                    activeIndex: 0,
                    matchCount: 0
                },
                __applySearchHighlights() {
                    const proseMirror = options.root.querySelector('.ProseMirror');
                    if (!(proseMirror instanceof HTMLElement)) {
                        return;
                    }

                    proseMirror.innerHTML = '<p><strong>pri</strong><em>mary</em></p>';
                    const query = editor.__search?.query.toLowerCase() ?? '';
                    if (!query) {
                        editor.__search!.matchCount = 0;
                        return;
                    }

                    proseMirror.innerHTML = `
                      <p>
                        <strong><mark class="markdown-search-highlight markdown-search-highlight--active" data-match-index="0">pri</mark></strong>
                        <em><mark class="markdown-search-highlight markdown-search-highlight--active" data-match-index="0">mary</mark></em>
                      </p>
                    `;
                    editor.__search!.matchCount = 1;
                }
            };
            return editor;
        });

        const windowErrorHandler = vi.fn();
        window.addEventListener('error', windowErrorHandler);

        const { default: DocumentEditorPane } = await import('./DocumentEditorPane.vue');
        const wrapper = mount(DocumentEditorPane, {
            props: {
                activePath: '/notes/overall.md',
                activeDocument: {
                    path: '/notes/overall.md',
                    mimeType: 'text/markdown',
                    dataBase64: encodeTextDocument('primary'),
                    canWrite: true
                },
                activeViewerId: 'text',
                activePaneMode: 'viewer',
                modelValue: 'primary',
                isSaving: false,
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false
            },
            attachTo: document.body
        });
        await Promise.resolve();
        await wrapper.vm.$nextTick();

        const openEvent = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, cancelable: true });
        window.dispatchEvent(openEvent);
        await wrapper.vm.$nextTick();

        await wrapper.get('[data-testid="document-viewer-search-input"]').setValue('primary');
        await Promise.resolve();
        await wrapper.vm.$nextTick();

        expect(wrapper.get('[data-testid="document-viewer-search-count"]').text()).toContain('1/1');
        expect(wrapper.findAll('.markdown-search-highlight')).toHaveLength(2);
        expect(setMarkdownEditorSearchQuery).toHaveBeenCalled();
        expect(setMarkdownEditorActiveSearchMatchIndex).toHaveBeenCalled();
        expect(windowErrorHandler).not.toHaveBeenCalled();

        window.removeEventListener('error', windowErrorHandler);
        wrapper.unmount();
    });

    it('reflects dirty and saving save button states', async () => {
        const { default: DocumentEditorPane } = await import('./DocumentEditorPane.vue');
        const wrapper = mount(DocumentEditorPane, {
            props: {
                activePath: '/notes/today.md',
                activeDocument: {
                    path: '/notes/today.md',
                    mimeType: 'text/markdown',
                    dataBase64: encodeTextDocument('# Today'),
                    canWrite: true
                },
                activeViewerId: 'text',
                activePaneMode: 'viewer',
                modelValue: '# Today',
                isSaving: false,
                isDirty: true,
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false
            }
        });

        expect(wrapper.get('[data-testid="document-save"]').classes()).toContain('save-button--dirty');
        expect(wrapper.get('[data-testid="document-save"]').attributes('title')).toBe('Unsaved changes');

        await wrapper.setProps({ isSaving: true });
        expect(wrapper.get('[data-testid="document-save"]').classes()).toContain('save-button--saving');
        expect(wrapper.get('[data-testid="document-save"]').attributes('disabled')).toBeDefined();
    });
});
