// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { defineComponent, nextTick, ref } from 'vue';

enableAutoUnmount(afterEach);
import { encodeTextDocument } from '@packages/core/src';

const createMarkdownEditor = vi.fn();
const buildRelativeMarkdownLinkPath = vi.fn((from: string, to: string) => {
    const fromDirectory = from.slice(0, from.lastIndexOf('/') + 1);
    return to.startsWith(fromDirectory) ? to.slice(fromDirectory.length) : to;
});
const buildMarkdownResourceInsertion = vi.fn((from: string, to: string) => {
    const href = buildRelativeMarkdownLinkPath(from, to);
    if (to.endsWith('.png')) {
        return {
            markdown: `![](${href})`,
            preferBlock: false
        };
    }
    if (to.endsWith('.pdf')) {
        return {
            markdown: ['','', '```cp-pdf-embed', `{"label":"spec.pdf","candidates":["${href}"],"showLink":false}`, '```', '', ''].join('\n'),
            preferBlock: true
        };
    }
    return {
        markdown: `[file](${href})`,
        preferBlock: false
    };
});
const captureRenderableMarkdownSelection = vi.fn<(root: HTMLElement) => { blockText: string; start: number; end: number; selectedText: string; blockIndex?: number } | null>(() => null);
const insertMarkdownAtViewerSelection = vi.fn(() => false);
const applyMarkdownLinkAtViewerSelection = vi.fn(() => true);
const toggleMarkdownHighlightAtViewerSelection = vi.fn(() => true);
const toggleMarkAtViewerSelection = vi.fn(() => true);
const findResizableMarkdownImageSource = vi.fn(() => null);
const insertPastedMarkdownImage = vi.fn((markdown: string, selection: { start: number; end: number }, imageMarkdown: string) => (
    `${markdown.slice(0, selection.start)}${imageMarkdown}${markdown.slice(selection.end)}`
));
const replaceMarkdownDocument = vi.fn();
const readMarkdownDocument = vi.fn();
const resolveMarkdownSourceSelection = vi.fn<(markdown: string, snapshot: unknown) => { start: number; end: number } | null>(() => null);
const rewriteMarkdownImageRatio = vi.fn((markdown: string) => markdown);
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
const openSingleFileDialog = vi.fn();

vi.mock('../utils/markdownDocument', () => ({
    applyMarkdownLinkAtViewerSelection,
    buildMarkdownResourceInsertion,
    buildRelativeMarkdownLinkPath,
    captureRenderableMarkdownSelection,
    createMarkdownEditor,
    findResizableMarkdownImageSource,
    insertMarkdownAtViewerSelection,
    toggleMarkdownHighlightAtViewerSelection,
    toggleMarkAtViewerSelection,
    insertPastedMarkdownImage,
    replaceMarkdownDocument,
    readMarkdownDocument,
    resolveMarkdownSourceSelection,
    rewriteMarkdownImageRatio,
    destroyMarkdownEditor,
    normalizeMarkdownViewerContent,
    setMarkdownEditorSearchQuery,
    setMarkdownEditorActiveSearchMatchIndex,
    getMarkdownEditorSearchMatchCount,
    scrollToMarkdownEditorSearchMatch
}));

vi.mock('../utils/fileDialog', () => ({
    openSingleFileDialog
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
        openSingleFileDialog.mockReset();
        openSingleFileDialog.mockResolvedValue(null);
        applyMarkdownLinkAtViewerSelection.mockReset();
        applyMarkdownLinkAtViewerSelection.mockReturnValue(true);
        insertMarkdownAtViewerSelection.mockReset();
        insertMarkdownAtViewerSelection.mockReturnValue(false);
        captureRenderableMarkdownSelection.mockReset();
        captureRenderableMarkdownSelection.mockReturnValue({
            blockText: 'mock-block',
            start: 0,
            end: 0,
            selectedText: ''
        });
        resolveMarkdownSourceSelection.mockReset();
        resolveMarkdownSourceSelection.mockImplementation((markdown: string) => ({
            start: markdown.length,
            end: markdown.length
        }));
        createMarkdownEditor.mockResolvedValue({ content: 'mock-editor' });
        vi.stubGlobal('URL', {
            createObjectURL,
            revokeObjectURL
        });
    });

    async function mountDocumentEditorWithModelSync(
        input: Record<string, unknown>
    ) {
        const { default: DocumentEditorPane } = await import('./DocumentEditorPane.vue');
        const Harness = defineComponent({
            components: { DocumentEditorPane },
            setup() {
                const modelValue = ref(String(input.modelValue ?? ''));
                const updateHistory = ref<string[]>([]);
                const paneProps = {
                    ...input
                };
                const applyUpdate = async (value: string) => {
                    updateHistory.value.push(value);
                    await nextTick();
                    modelValue.value = value;
                };

                return {
                    applyUpdate,
                    modelValue,
                    paneProps,
                    updateHistory
                };
            },
            template: `
              <DocumentEditorPane
                v-bind="paneProps"
                :model-value="modelValue"
                @update:model-value="applyUpdate"
              />
            `
        });

        return mount(Harness);
    }

    it('shows the active document name in the middle pane title area', async () => {
        const { default: DocumentEditorPane } = await import('./DocumentEditorPane.vue');
        const wrapper = mount(DocumentEditorPane, {
            props: {
                activePath: '/docs/guide.md',
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

        expect(wrapper.get('[data-testid="document-editor-title"]').text()).toBe('guide');
    });

    it('inserts a relative markdown link via in-place command in viewer mode without switching to source', async () => {
        applyMarkdownLinkAtViewerSelection.mockClear();
        const wrapper = await mountDocumentEditorWithModelSync({
            activePath: '/docs/guide.md',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('Read this'),
                canWrite: true
            },
            activeViewerId: 'text',
            activePaneMode: 'viewer',
            modelValue: 'Read this',
            linkableMarkdownDocuments: [
                { path: '/docs/reference.md', name: 'reference.md', kind: 'file', parentPath: '/docs' }
            ],
            isSaving: false,
            isDirty: false,
            latestFileChange: null,
            diffEntries: [],
            canUndo: false,
            canRedo: false
        });

        await wrapper.get('[data-testid="markdown-insert-link"]').trigger('click');
        await wrapper.get('[data-testid="markdown-link-option-/docs/reference.md"]').trigger('click');
        await wrapper.vm.$nextTick();

        // Applied via in-place ProseMirror command — no source-offset mapping needed.
        expect(applyMarkdownLinkAtViewerSelection).toHaveBeenCalledTimes(1);
        expect(applyMarkdownLinkAtViewerSelection).toHaveBeenCalledWith(
            expect.anything(),
            { label: 'reference', href: 'reference.md' }
        );
        expect(resolveMarkdownSourceSelection).not.toHaveBeenCalled();
        // Picker closed; viewer mode maintained (no textarea).
        expect(wrapper.find('[data-testid="markdown-link-picker"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="document-editor-input"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="markdown-mode-toggle"]').attributes('aria-pressed')).toBe('true');
    });

    it('inserts a conversation markdown link via in-place viewer command without switching to source', async () => {
        insertMarkdownAtViewerSelection.mockClear();
        const wrapper = await mountDocumentEditorWithModelSync({
            activePath: '/docs/guide.md',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('See discussion'),
                canWrite: true
            },
            activeViewerId: 'text',
            activePaneMode: 'viewer',
            modelValue: 'See discussion',
            insertLinkTypes: [
                {
                    id: 'conversation',
                    title: 'Conversations',
                    items: [
                        {
                            id: 'conversation-1',
                            title: 'Plan review',
                            markdown: '[Plan review](chatprism://conversation/conversation-1)'
                        }
                    ]
                }
            ],
            isSaving: false,
            isDirty: false,
            latestFileChange: null,
            diffEntries: [],
            canUndo: false,
            canRedo: false
        });

        await wrapper.get('[data-testid="markdown-insert-link"]').trigger('click');
        await wrapper.get('[data-testid="markdown-link-tab-conversation"]').trigger('click');
        await wrapper.get('[data-testid="markdown-insert-link-option-conversation-conversation-1"]').trigger('click');
        await wrapper.vm.$nextTick();

        // Applied via in-place ProseMirror insertion — no source-offset mapping needed.
        expect(insertMarkdownAtViewerSelection).toHaveBeenCalledTimes(1);
        expect(insertMarkdownAtViewerSelection).toHaveBeenCalledWith(
            expect.anything(),
            '[Plan review](chatprism://conversation/conversation-1)'
        );
        expect(resolveMarkdownSourceSelection).not.toHaveBeenCalled();
        // Picker closed; viewer mode maintained (no textarea).
        expect(wrapper.find('[data-testid="markdown-link-picker"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="document-editor-input"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="markdown-mode-toggle"]').attributes('aria-pressed')).toBe('true');
    });

    it('toggles highlight directly in the viewer without round-tripping through source mode', async () => {
        // 原型：viewer 模式高亮改走 ProseMirror 直接 toggleMark，不再切到 edit 源码模式拼接 ==..==。
        toggleMarkdownHighlightAtViewerSelection.mockClear();
        const wrapper = await mountDocumentEditorWithModelSync({
            activePath: '/docs/guide.md',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('Read this'),
                canWrite: true
            },
            activeViewerId: 'text',
            activePaneMode: 'viewer',
            modelValue: 'Read this',
            isSaving: false,
            isDirty: false,
            latestFileChange: null,
            diffEntries: [],
            canUndo: false,
            canRedo: false
        });

        await wrapper.get('[data-testid="markdown-style-picker-trigger"]').trigger('click');
        await wrapper.get('[data-testid="markdown-style-option-highlight"]').trigger('click');
        await wrapper.vm.$nextTick();
        await wrapper.vm.$nextTick();
        await wrapper.vm.$nextTick();

        // 走的是 viewer 直插命令，且不再经过源码偏移映射。
        expect(toggleMarkdownHighlightAtViewerSelection).toHaveBeenCalledTimes(1);
        expect(resolveMarkdownSourceSelection).not.toHaveBeenCalled();
        expect(wrapper.find('[data-testid="markdown-style-picker"]').exists()).toBe(false);
    });

    it('toggles bold directly in the viewer with the strong mark without switching to source mode', async () => {
        // 回归：粗体/删除线在 viewer 模式必须与高亮原理一致，走 ProseMirror toggleMark，
        // 不得 fallthrough 到 edit 源码模式（曾导致切模式 + 插入位置不准）。
        toggleMarkAtViewerSelection.mockClear();
        const wrapper = await mountDocumentEditorWithModelSync({
            activePath: '/docs/guide.md',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('Read this'),
                canWrite: true
            },
            activeViewerId: 'text',
            activePaneMode: 'viewer',
            modelValue: 'Read this',
            isSaving: false,
            isDirty: false,
            latestFileChange: null,
            diffEntries: [],
            canUndo: false,
            canRedo: false
        });

        await wrapper.get('[data-testid="markdown-style-picker-trigger"]').trigger('click');
        await wrapper.get('[data-testid="markdown-style-option-bold"]').trigger('click');
        await wrapper.vm.$nextTick();
        await wrapper.vm.$nextTick();
        await wrapper.vm.$nextTick();

        // 走 viewer 直插命令、传入 strong mark，不经过源码偏移映射，且保持 viewer 模式。
        expect(toggleMarkAtViewerSelection).toHaveBeenCalledTimes(1);
        expect(toggleMarkAtViewerSelection.mock.calls[0]?.[1]).toBe('strong');
        expect(resolveMarkdownSourceSelection).not.toHaveBeenCalled();
        expect(wrapper.find('[data-testid="document-editor-input"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="markdown-mode-toggle"]').attributes('aria-pressed')).toBe('true');
        expect(wrapper.find('[data-testid="markdown-style-picker"]').exists()).toBe(false);
    });

    it('inserts an embedded pdf resource via in-place viewer command without switching to source', async () => {
        insertMarkdownAtViewerSelection.mockClear();
        const wrapper = await mountDocumentEditorWithModelSync({
            activePath: '/docs/guide.md',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('Open attachment'),
                canWrite: true
            },
            activeViewerId: 'text',
            activePaneMode: 'viewer',
            modelValue: 'Open attachment',
            linkableReferenceResources: [
                { path: '/docs/references/spec.pdf', name: 'spec.pdf', kind: 'file', parentPath: '/docs/references' }
            ],
            isSaving: false,
            isDirty: false,
            latestFileChange: null,
            diffEntries: [],
            canUndo: false,
            canRedo: false
        });

        await wrapper.get('[data-testid="markdown-insert-link"]').trigger('click');
        await wrapper.get('[data-testid="markdown-link-tab-resource"]').trigger('click');
        await wrapper.get('[data-testid="markdown-resource-link-option-/docs/references/spec.pdf"]').trigger('click');
        await wrapper.vm.$nextTick();

        // Applied via in-place ProseMirror insertion — no source-offset mapping needed.
        expect(insertMarkdownAtViewerSelection).toHaveBeenCalledTimes(1);
        expect(insertMarkdownAtViewerSelection).toHaveBeenCalledWith(
            expect.anything(),
            '\n\n```cp-pdf-embed\n{"label":"spec.pdf","candidates":["references/spec.pdf"],"showLink":false}\n```\n\n'
        );
        expect(resolveMarkdownSourceSelection).not.toHaveBeenCalled();
        // Picker closed; viewer mode maintained (no textarea).
        expect(wrapper.find('[data-testid="markdown-link-picker"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="document-editor-input"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="markdown-mode-toggle"]').attributes('aria-pressed')).toBe('true');
    });

    it('inserts an embedded image resource via in-place viewer command without switching to source', async () => {
        insertMarkdownAtViewerSelection.mockClear();
        const wrapper = await mountDocumentEditorWithModelSync({
            activePath: '/docs/guide.md',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('See image'),
                canWrite: true
            },
            activeViewerId: 'text',
            activePaneMode: 'viewer',
            modelValue: 'See image',
            linkableReferenceResources: [
                { path: '/docs/references/diagram.png', name: 'diagram.png', kind: 'file', parentPath: '/docs/references' }
            ],
            isSaving: false,
            isDirty: false,
            latestFileChange: null,
            diffEntries: [],
            canUndo: false,
            canRedo: false
        });

        await wrapper.get('[data-testid="markdown-insert-link"]').trigger('click');
        await wrapper.get('[data-testid="markdown-link-tab-resource"]').trigger('click');
        await wrapper.get('[data-testid="markdown-resource-link-option-/docs/references/diagram.png"]').trigger('click');
        await wrapper.vm.$nextTick();

        // Applied via in-place ProseMirror insertion — no source-offset mapping needed.
        expect(insertMarkdownAtViewerSelection).toHaveBeenCalledTimes(1);
        expect(insertMarkdownAtViewerSelection).toHaveBeenCalledWith(
            expect.anything(),
            '![](references/diagram.png)'
        );
        expect(resolveMarkdownSourceSelection).not.toHaveBeenCalled();
        // Picker closed; viewer mode maintained (no textarea).
        expect(wrapper.find('[data-testid="markdown-link-picker"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="document-editor-input"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="markdown-mode-toggle"]').attributes('aria-pressed')).toBe('true');
    });

    it('uploads a new resource from the link picker and inserts it via in-place viewer command', async () => {
        insertMarkdownAtViewerSelection.mockClear();
        const uploadMarkdownLinkResource = vi.fn(async () => ({
            resourcePath: '/docs/references/uploaded.pdf'
        }));
        const file = new File(['pdf'], 'uploaded.pdf', { type: 'application/pdf' });
        Object.defineProperty(file, 'arrayBuffer', {
            configurable: true,
            value: vi.fn(async () => new TextEncoder().encode('pdf').buffer)
        });
        openSingleFileDialog.mockResolvedValue(file);
        const wrapper = await mountDocumentEditorWithModelSync({
            activePath: '/docs/guide.md',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('Attach file'),
                canWrite: true
            },
            activeViewerId: 'text',
            activePaneMode: 'viewer',
            modelValue: 'Attach file',
            linkableReferenceResources: [],
            uploadMarkdownLinkResource,
            isSaving: false,
            isDirty: false,
            latestFileChange: null,
            diffEntries: [],
            canUndo: false,
            canRedo: false
        });

        await wrapper.get('[data-testid="markdown-insert-link"]').trigger('click');
        await wrapper.get('[data-testid="markdown-link-tab-resource"]').trigger('click');
        await wrapper.get('[data-testid="markdown-resource-upload"]').trigger('click');
        await wrapper.vm.$nextTick();
        await wrapper.vm.$nextTick();
        await wrapper.vm.$nextTick();

        expect(openSingleFileDialog).toHaveBeenCalledTimes(1);
        expect(uploadMarkdownLinkResource).toHaveBeenCalledWith(expect.objectContaining({
            documentPath: '/docs/guide.md',
            fileName: 'uploaded.pdf',
            mimeType: 'application/pdf'
        }));
        // Applied via in-place ProseMirror insertion — no source-offset mapping needed.
        expect(insertMarkdownAtViewerSelection).toHaveBeenCalledTimes(1);
        expect(insertMarkdownAtViewerSelection).toHaveBeenCalledWith(
            expect.anything(),
            expect.stringContaining('references/uploaded.pdf')
        );
        expect(resolveMarkdownSourceSelection).not.toHaveBeenCalled();
        // Viewer mode maintained (no textarea).
        expect(wrapper.find('[data-testid="document-editor-input"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="markdown-mode-toggle"]').attributes('aria-pressed')).toBe('true');
    });

    it('emits refresh-document from the toolbar button', async () => {
        const { default: DocumentEditorPane } = await import('./DocumentEditorPane.vue');
        const wrapper = mount(DocumentEditorPane, {
            props: {
                activePath: '/docs/guide.md',
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
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false
            }
        });

        await wrapper.get('[data-testid="document-refresh"]').trigger('click');
        expect(wrapper.emitted('refresh-document')).toEqual([[]]);
    });

    it('retries markdown insertion until edit mode is ready', async () => {
        let onChange: ((markdown: string) => void) | undefined;
        createMarkdownEditor.mockImplementation(async (options: { onChange: (markdown: string) => void }) => {
            onChange = options.onChange;
            return { content: 'Retry me' };
        });
        readMarkdownDocument.mockImplementation((value: { content: string }) => value.content);

        const wrapper = await mountDocumentEditorWithModelSync({
            activePath: '/docs/guide.md',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('Retry me'),
                canWrite: true
            },
            activeViewerId: 'text',
            activePaneMode: 'viewer',
            modelValue: 'Retry me',
            linkableMarkdownDocuments: [
                { path: '/docs/reference.md', name: 'reference.md', kind: 'file', parentPath: '/docs' }
            ],
            isSaving: false,
            isDirty: false,
            latestFileChange: null,
            diffEntries: [],
            canUndo: false,
            canRedo: false
        });

        await wrapper.get('[data-testid="markdown-insert-link"]').trigger('click');
        await wrapper.get('[data-testid="markdown-link-option-/docs/reference.md"]').trigger('click');
        onChange?.('Retry me[reference](reference.md)');
        await wrapper.vm.$nextTick();
        await wrapper.vm.$nextTick();
        await wrapper.vm.$nextTick();

        expect(wrapper.vm.updateHistory).toContain('Retry me[reference](reference.md)');
        expect(wrapper.find('[data-testid="markdown-link-picker"]').exists()).toBe(false);
    });

    it('stays in viewer mode throughout document link insertion (no mode round-trip)', async () => {
        applyMarkdownLinkAtViewerSelection.mockClear();
        createMarkdownEditor.mockResolvedValue({ content: 'Parent sync' });
        readMarkdownDocument.mockImplementation((value: { content: string }) => value.content);

        const { default: DocumentEditorPane } = await import('./DocumentEditorPane.vue');
        const Harness = defineComponent({
            components: { DocumentEditorPane },
            setup() {
                const modelValue = ref('Parent sync');
                const applyUpdate = async (value: string) => {
                    await nextTick();
                    modelValue.value = value;
                };

                return {
                    modelValue,
                    applyUpdate
                };
            },
            template: `
              <DocumentEditorPane
                active-path="/docs/guide.md"
                :active-document="{ path: '/docs/guide.md', mimeType: 'text/markdown', dataBase64: 'UGFyZW50IHN5bmM=', canWrite: true }"
                active-viewer-id="text"
                active-pane-mode="viewer"
                :model-value="modelValue"
                :linkable-markdown-documents="[{ path: '/docs/reference.md', name: 'reference.md', kind: 'file', parentPath: '/docs' }]"
                :is-saving="false"
                :latest-file-change="null"
                :diff-entries="[]"
                :can-undo="false"
                :can-redo="false"
                @update:model-value="applyUpdate"
              />
            `
        });

        const wrapper = mount(Harness);
        await wrapper.get('[data-testid="markdown-insert-link"]').trigger('click');
        await wrapper.get('[data-testid="markdown-link-option-/docs/reference.md"]').trigger('click');
        await wrapper.vm.$nextTick();

        // Viewer mode is maintained at all times — no mode round-trip.
        expect(wrapper.get('[data-testid="markdown-mode-toggle"]').attributes('aria-pressed')).toBe('true');
        expect(applyMarkdownLinkAtViewerSelection).toHaveBeenCalledTimes(1);
        expect(wrapper.find('[data-testid="markdown-link-picker"]').exists()).toBe(false);
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
        expect(modeToggle.attributes('aria-label')).toBe('Source');
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
        expect(modeToggle.attributes('aria-label')).toBe('Render');
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

        expect(replaceMarkdownDocument).not.toHaveBeenCalled();
        expect(createMarkdownEditor).toHaveBeenCalledTimes(2);
        expect(createMarkdownEditor).toHaveBeenNthCalledWith(2, expect.objectContaining({
            documentPath: '/notes/today.md',
            content: '# Today'
        }));
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

    it('renders the markdown toolbar in three separated groups with the requested button order', async () => {
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

        expect(wrapper.findAll('[data-testid^="document-toolbar-group-"]')).toHaveLength(3);
        expect(wrapper.get('[data-testid="document-toolbar-group-mode"] [data-testid="markdown-mode-toggle"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="document-toolbar-group-insert"] .editor-link-picker:nth-child(1) [data-testid="markdown-insert-link"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="document-toolbar-group-insert"] .editor-link-picker:nth-child(2) [data-testid="markdown-style-picker-trigger"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="document-toolbar-group-insert"] .editor-link-picker:nth-child(3) [data-testid="markdown-block-picker-trigger"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="document-toolbar-group-actions"] .save-button:nth-child(1)').attributes('data-testid')).toBe('document-refresh');
        expect(wrapper.get('[data-testid="document-toolbar-group-actions"] .save-button:nth-child(2)').attributes('data-testid')).toBe('document-save');
        expect(wrapper.get('[data-testid="document-toolbar-group-actions"] .save-button:nth-child(3)').attributes('data-testid')).toBe('document-middle-pane-toggle');
    });

    it('closes a toolbar picker when a pointer interaction is outside its trigger and menu', async () => {
        const editor = { content: '# Draft' };
        createMarkdownEditor.mockResolvedValue(editor);
        readMarkdownDocument.mockImplementation((value: { content: string }) => value.content);

        const { default: DocumentEditorPane } = await import('./DocumentEditorPane.vue');
        const wrapper = mount(DocumentEditorPane, {
            attachTo: document.body,
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
        await wrapper.get('[data-testid="markdown-style-picker-trigger"]').trigger('click');
        expect(wrapper.find('[data-testid="markdown-style-picker"]').exists()).toBe(true);

        document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
        await wrapper.vm.$nextTick();

        expect(wrapper.find('[data-testid="markdown-style-picker"]').exists()).toBe(false);
    });

    it('hides the toolbar but keeps the title when hideToolbar is true', async () => {
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
                hideToolbar: true,
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

        expect(wrapper.get('[data-testid="document-editor-title"]').text()).toBe('draft');
        expect(wrapper.find('[data-testid="document-toolbar-group-mode"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="document-toolbar-group-insert"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="document-toolbar-group-actions"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="document-middle-pane-toggle"]').exists()).toBe(false);
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
        expect(wrapper.find('[data-testid="document-readonly-banner"]').exists()).toBe(false);

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
        expect(wrapper.find('[data-testid="document-readonly-banner"]').exists()).toBe(false);
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
        expect(wrapper.find('[data-testid="document-readonly-banner"]').exists()).toBe(false);
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
        expect(wrapper.find('[data-testid="document-readonly-banner"]').exists()).toBe(false);
    });

    it('shows the offline read-only banner only for editable text documents', async () => {
        const { default: DocumentEditorPane } = await import('./DocumentEditorPane.vue');
        const wrapper = mount(DocumentEditorPane, {
            props: {
                activePath: '/notes/offline.md',
                activeDocument: {
                    path: '/notes/offline.md',
                    mimeType: 'text/markdown',
                    dataBase64: encodeTextDocument('# Offline'),
                    canWrite: false
                },
                activeViewerId: 'text',
                activePaneMode: 'viewer',
                modelValue: '# Offline',
                isSaving: false,
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false
            }
        });

        expect(wrapper.find('[data-testid="document-readonly-banner"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="document-readonly-banner"]').text()).toContain('read-only offline');
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

    it('handles cmd/ctrl+s as save when the document can be saved', async () => {
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
            },
            attachTo: document.body
        });

        const saveEvent = new KeyboardEvent('keydown', { key: 's', metaKey: true, cancelable: true });
        window.dispatchEvent(saveEvent);
        await wrapper.vm.$nextTick();

        expect(saveEvent.defaultPrevented).toBe(true);
        expect(wrapper.emitted('save')).toHaveLength(1);

        wrapper.unmount();
    });
});
