// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';

enableAutoUnmount(afterEach);

const createMarkdownEditor = vi.fn();
const destroyMarkdownEditor = vi.fn();
const findResizableMarkdownImageSource = vi.fn();
const insertPastedMarkdownImage = vi.fn((markdown: string, selection: { start: number; end: number }, imageMarkdown: string) => {
    return `${markdown.slice(0, selection.start)}${imageMarkdown}${markdown.slice(selection.end)}`;
});
const normalizeMarkdownViewerContent = vi.fn((content: string) => content);
const readMarkdownDocument = vi.fn((editor: { content: string }) => editor.content);
const replaceMarkdownDocument = vi.fn();
const setMarkdownEditorSearchQuery = vi.fn();
const setMarkdownEditorActiveSearchMatchIndex = vi.fn();
const getMarkdownEditorSearchMatchCount = vi.fn(() => 0);
const scrollToMarkdownEditorSearchMatch = vi.fn();
const captureRenderableMarkdownSelection = vi.fn();
const resolveMarkdownSourceSelection = vi.fn();
const resolveEmptyBlockMarkdownOffset = vi.fn(() => null);
const resolveEmptyBlockAnchorFallback = vi.fn(() => null);
const insertMarkdownAtViewerSelection = vi.fn(() => false);
const rewriteMarkdownImageRatio = vi.fn();

vi.mock('../utils/markdownDocument', () => ({
    captureRenderableMarkdownSelection,
    createMarkdownEditor,
    destroyMarkdownEditor,
    findResizableMarkdownImageSource,
    insertMarkdownAtViewerSelection,
    insertPastedMarkdownImage,
    normalizeMarkdownViewerContent,
    readMarkdownDocument,
    replaceMarkdownDocument,
    resolveEmptyBlockAnchorFallback,
    resolveEmptyBlockMarkdownOffset,
    resolveMarkdownSourceSelection,
    rewriteMarkdownImageRatio,
    setMarkdownEditorSearchQuery,
    setMarkdownEditorActiveSearchMatchIndex,
    getMarkdownEditorSearchMatchCount,
    scrollToMarkdownEditorSearchMatch
}));

describe('MarkdownDocumentViewer', () => {
    beforeEach(() => {
        createMarkdownEditor.mockReset();
        destroyMarkdownEditor.mockReset();
        findResizableMarkdownImageSource.mockReset();
        normalizeMarkdownViewerContent.mockClear();
        readMarkdownDocument.mockReset();
        replaceMarkdownDocument.mockReset();
        setMarkdownEditorSearchQuery.mockReset();
        setMarkdownEditorActiveSearchMatchIndex.mockReset();
        getMarkdownEditorSearchMatchCount.mockReset();
        scrollToMarkdownEditorSearchMatch.mockReset();
        captureRenderableMarkdownSelection.mockReset();
        resolveMarkdownSourceSelection.mockReset();
        rewriteMarkdownImageRatio.mockReset();
    });

    it('enables soft wrapping in markdown edit mode', async () => {
        const { default: MarkdownDocumentViewer } = await import('./MarkdownDocumentViewer.vue');
        const wrapper = mount(MarkdownDocumentViewer, {
            attachTo: document.body,
            props: {
                activePath: '/docs/guide.md',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: '',
                    canWrite: true
                },
                modelValue: '# Title\n\nThis is a very long line that should wrap when edit mode is active.',
                markdownViewerMode: 'edit',
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false,
                middlePaneZoom: 1
            }
        });

        await Promise.resolve();
        await wrapper.vm.$nextTick();

        const textarea = wrapper.get('[data-testid="document-editor-input"]');
        expect(textarea.attributes('wrap')).toBe('soft');
    });

    it('recreates the viewer editor when the active document path changes', async () => {
        const firstEditor = { content: '![Diagram](./flow.png)' };
        const secondEditor = { content: '![Diagram](./flow.png)' };
        createMarkdownEditor
            .mockResolvedValueOnce(firstEditor)
            .mockResolvedValueOnce(secondEditor);

        const { default: MarkdownDocumentViewer } = await import('./MarkdownDocumentViewer.vue');
        const wrapper = mount(MarkdownDocumentViewer, {
            props: {
                activePath: '/docs/guide.md',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: '',
                    canWrite: true
                },
                modelValue: '![Diagram](./flow.png)',
                markdownViewerMode: 'viewer',
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false,
                middlePaneZoom: 1
            }
        });

        await Promise.resolve();
        await wrapper.vm.$nextTick();

        expect(createMarkdownEditor).toHaveBeenCalledTimes(1);
        expect(createMarkdownEditor).toHaveBeenNthCalledWith(1, expect.objectContaining({
            documentPath: '/docs/guide.md',
            mode: 'viewer'
        }));
        expect(replaceMarkdownDocument).not.toHaveBeenCalled();

        await wrapper.setProps({
            activePath: '/archive/guide.md',
            activeDocument: {
                path: '/archive/guide.md',
                mimeType: 'text/markdown',
                dataBase64: '',
                canWrite: true
            },
            modelValue: '![Diagram](./flow.png)'
        });

        await Promise.resolve();
        await Promise.resolve();
        await wrapper.vm.$nextTick();

        expect(destroyMarkdownEditor).toHaveBeenCalledWith(firstEditor);
        expect(createMarkdownEditor).toHaveBeenCalledTimes(2);
        expect(createMarkdownEditor).toHaveBeenNthCalledWith(2, expect.objectContaining({
            documentPath: '/archive/guide.md',
            mode: 'viewer'
        }));
        expect(replaceMarkdownDocument).not.toHaveBeenCalled();
    });

    it('inserts markdown links in edit mode and wraps the current selection', async () => {
        const { default: MarkdownDocumentViewer } = await import('./MarkdownDocumentViewer.vue');
        const wrapper = mount(MarkdownDocumentViewer, {
            props: {
                activePath: '/docs/guide.md',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: '',
                    canWrite: true
                },
                modelValue: 'Read this',
                markdownViewerMode: 'edit',
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false,
                middlePaneZoom: 1
            }
        });

        await Promise.resolve();
        await wrapper.vm.$nextTick();

        const textarea = wrapper.get('[data-testid="document-editor-input"]').element as HTMLTextAreaElement;
        textarea.focus();
        textarea.setSelectionRange(5, 9);
        (wrapper.vm as unknown as { insertMarkdownLink: (input: { label: string; href: string }) => boolean })
            .insertMarkdownLink({ label: 'reference', href: 'reference.md' });

        expect(wrapper.emitted('update:modelValue')).toEqual([
            ['Read [this](reference.md)']
        ]);
    });

    it('prepares a markdown source selection from a render selection snapshot in viewer mode', async () => {
        createMarkdownEditor.mockResolvedValue({ content: 'Intro target' });
        captureRenderableMarkdownSelection.mockReturnValue({
            blockText: 'Intro target',
            start: 6,
            end: 12,
            selectedText: 'target'
        });
        resolveMarkdownSourceSelection.mockReturnValue({
            start: 6,
            end: 12
        });

        const { default: MarkdownDocumentViewer } = await import('./MarkdownDocumentViewer.vue');
        const wrapper = mount(MarkdownDocumentViewer, {
            attachTo: document.body,
            props: {
                activePath: '/docs/guide.md',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: '',
                    canWrite: true
                },
                modelValue: 'Intro target',
                markdownViewerMode: 'viewer',
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false,
                middlePaneZoom: 1
            }
        });

        await Promise.resolve();
        await wrapper.vm.$nextTick();

        expect((wrapper.vm as unknown as { prepareMarkdownSelectionFromViewer: () => boolean }).prepareMarkdownSelectionFromViewer()).toBe(true);

        await wrapper.setProps({ markdownViewerMode: 'edit' });
        await Promise.resolve();
        await wrapper.vm.$nextTick();

        (wrapper.vm as unknown as { insertMarkdownLink: (input: { label: string; href: string }) => boolean })
            .insertMarkdownLink({ label: 'reference', href: 'reference.md' });

        expect(wrapper.emitted('update:modelValue')).toEqual([
            ['Intro [target](reference.md)']
        ]);
    });

    it('rewrites markdown source when a viewer image resize resolves to a unique source span', async () => {
        let onResizeMarkdownImage: ((payload: { src: string; ratio: number }) => void) | undefined;
        createMarkdownEditor.mockImplementation(async (options: { onResizeMarkdownImage?: (payload: { src: string; ratio: number }) => void }) => {
            onResizeMarkdownImage = options.onResizeMarkdownImage;
            return { content: '![Diagram](./flow.png)' };
        });
        findResizableMarkdownImageSource.mockReturnValue({
            start: 0,
            end: 22,
            kind: 'markdown-image',
            raw: '![Diagram](./flow.png)'
        });
        rewriteMarkdownImageRatio.mockReturnValue('![1.50](./flow.png)');

        const { default: MarkdownDocumentViewer } = await import('./MarkdownDocumentViewer.vue');
        const wrapper = mount(MarkdownDocumentViewer, {
            props: {
                activePath: '/docs/guide.md',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: '',
                    canWrite: true
                },
                modelValue: '![Diagram](./flow.png)',
                markdownViewerMode: 'viewer',
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false,
                middlePaneZoom: 1
            }
        });

        await Promise.resolve();
        await wrapper.vm.$nextTick();
        onResizeMarkdownImage?.({ src: 'resolved-src', ratio: 1.5 });

        expect(findResizableMarkdownImageSource).toHaveBeenCalledWith('![Diagram](./flow.png)', 'resolved-src', '/docs/guide.md');
        expect(rewriteMarkdownImageRatio).toHaveBeenCalledWith('![Diagram](./flow.png)', expect.any(Object), 1.5);
        expect(wrapper.emitted('update:modelValue')).toEqual([
            ['![1.50](./flow.png)']
        ]);
    });

    it('persists pasted markdown images and inserts a relative markdown reference without touching existing content on failure', async () => {
        const persistMarkdownImage = vi.fn()
            .mockResolvedValueOnce({
                imagePath: '/docs/references/Pasted image.png',
                markdown: '![](references/Pasted%20image.png)'
            })
            .mockRejectedValueOnce(new Error('write failed'));

        const { default: MarkdownDocumentViewer } = await import('./MarkdownDocumentViewer.vue');
        const wrapper = mount(MarkdownDocumentViewer, {
            attachTo: document.body,
            props: {
                activePath: '/docs/guide.md',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: '',
                    canWrite: true
                },
                modelValue: 'Intro',
                markdownViewerMode: 'edit',
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false,
                middlePaneZoom: 1,
                persistMarkdownImage
            }
        });

        await Promise.resolve();
        await wrapper.vm.$nextTick();

        const textarea = wrapper.get('[data-testid="document-editor-input"]').element as HTMLTextAreaElement;
        textarea.setSelectionRange(5, 5);
        await wrapper.get('[data-testid="document-editor-input"]').trigger('paste', {
            clipboardData: {
                items: [
                    {
                        kind: 'file',
                        type: 'image/png',
                        getAsFile: () => new File(['png'], 'pasted.png', { type: 'image/png' })
                    }
                ],
                files: []
            }
        });
        await Promise.resolve();
        await wrapper.vm.$nextTick();

        expect(persistMarkdownImage).toHaveBeenCalledTimes(1);
        expect(insertPastedMarkdownImage).toHaveBeenCalledWith('Intro', { start: 5, end: 5 }, '![](references/Pasted%20image.png)');
        expect(wrapper.emitted('update:modelValue')?.at(0)).toEqual(['Intro![](references/Pasted%20image.png)']);

        await wrapper.setProps({ modelValue: 'Intro' });
        await wrapper.get('[data-testid="document-editor-input"]').trigger('paste', {
            clipboardData: {
                items: [
                    {
                        kind: 'file',
                        type: 'image/png',
                        getAsFile: () => new File(['png'], 'pasted.png', { type: 'image/png' })
                    }
                ],
                files: []
            }
        });
        await Promise.resolve();
        await wrapper.vm.$nextTick();

        expect(persistMarkdownImage).toHaveBeenCalledTimes(2);
        expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
    });

    it('persists pasted markdown images from viewer mode and inserts the reference into markdown source', async () => {
        createMarkdownEditor.mockResolvedValue({ content: 'Intro target' });
        captureRenderableMarkdownSelection.mockReturnValue({
            blockText: 'Intro target',
            start: 5,
            end: 5,
            selectedText: ''
        });
        resolveMarkdownSourceSelection.mockReturnValue({
            start: 5,
            end: 5
        });

        const persistMarkdownImage = vi.fn().mockResolvedValue({
            imagePath: '/docs/references/Pasted image.png',
            markdown: '![](references/Pasted%20image.png)'
        });

        const { default: MarkdownDocumentViewer } = await import('./MarkdownDocumentViewer.vue');
        const wrapper = mount(MarkdownDocumentViewer, {
            attachTo: document.body,
            props: {
                activePath: '/docs/guide.md',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: '',
                    canWrite: true
                },
                modelValue: 'Intro target',
                markdownViewerMode: 'viewer',
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false,
                middlePaneZoom: 1,
                persistMarkdownImage
            }
        });

        await Promise.resolve();
        await wrapper.vm.$nextTick();

        const surface = wrapper.get('[data-testid="document-editor-surface"]');
        await surface.trigger('paste', {
            clipboardData: {
                items: [
                    {
                        kind: 'file',
                        type: 'image/png',
                        getAsFile: () => new File(['png'], 'pasted.png', { type: 'image/png' })
                    }
                ],
                files: []
            }
        });
        await Promise.resolve();
        await wrapper.vm.$nextTick();

        expect(persistMarkdownImage).toHaveBeenCalledTimes(1);
        expect(insertPastedMarkdownImage).toHaveBeenCalledWith('Intro target', { start: 5, end: 5 }, '![](references/Pasted%20image.png)');
        expect(wrapper.emitted('update:modelValue')?.at(0)).toEqual(['Intro![](references/Pasted%20image.png) target']);
    });

    it('logs editorView context errors with navigation context while the viewer is tearing down', async () => {
        let onOpenDocumentLink: ((path: string) => void) | undefined;
        const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
        createMarkdownEditor.mockImplementation(async (options: { onOpenDocumentLink?: (path: string) => void }) => {
            onOpenDocumentLink = options.onOpenDocumentLink;
            return { content: '[Guide](./next.md)' };
        });

        const { default: MarkdownDocumentViewer } = await import('./MarkdownDocumentViewer.vue');
        mount(MarkdownDocumentViewer, {
            props: {
                activePath: '/docs/guide.md',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: '',
                    canWrite: true
                },
                modelValue: '[Guide](./next.md)',
                markdownViewerMode: 'viewer',
                latestFileChange: null,
                diffEntries: [],
                canUndo: false,
                canRedo: false,
                middlePaneZoom: 1
            }
        });

        await Promise.resolve();
        await Promise.resolve();

        onOpenDocumentLink?.('/docs/next.md');
        window.dispatchEvent(new ErrorEvent('error', {
            message: 'Context "editorView" not found, do you forget to inject it?'
        }));

        expect(consoleDebug).toHaveBeenCalledWith(
            '[markdown-viewer] editor-view-context-missing',
            expect.objectContaining({
                source: 'error',
                activePath: '/docs/guide.md',
                markdownViewerMode: 'viewer',
                navigatingAway: true,
                lastNavigationTarget: {
                    kind: 'document',
                    path: '/docs/next.md'
                }
            })
        );

        consoleDebug.mockRestore();
    });
});
