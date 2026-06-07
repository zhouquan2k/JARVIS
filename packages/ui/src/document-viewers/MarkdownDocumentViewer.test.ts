// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { defineComponent, nextTick, ref } from 'vue';

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
const applyMarkdownLinkAtViewerSelection = vi.fn(() => true);
const toggleMarkdownHighlightAtViewerSelection = vi.fn(() => true);
const rewriteMarkdownImageRatio = vi.fn();

vi.mock('../utils/markdownDocument', () => ({
    applyMarkdownLinkAtViewerSelection,
    captureRenderableMarkdownSelection,
    createMarkdownEditor,
    destroyMarkdownEditor,
    findResizableMarkdownImageSource,
    insertMarkdownAtViewerSelection,
    toggleMarkdownHighlightAtViewerSelection,
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
    let originalRequestAnimationFrame: typeof window.requestAnimationFrame;

    beforeEach(() => {
        originalRequestAnimationFrame = window.requestAnimationFrame.bind(window);
        vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        }) as typeof window.requestAnimationFrame);
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
        applyMarkdownLinkAtViewerSelection.mockReset();
        applyMarkdownLinkAtViewerSelection.mockReturnValue(true);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        window.requestAnimationFrame = originalRequestAnimationFrame;
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

    it('renders parsed markdown highlights with mark styling hooks in viewer mode', async () => {
        createMarkdownEditor.mockImplementation(async ({ root }: { root: HTMLElement }) => {
            root.innerHTML = `
              <div class="milkdown">
                <div class="ProseMirror">
                  <p><mark class="markdown-highlight">Alpha</mark></p>
                </div>
              </div>
            `;
            return { content: '==Alpha==' };
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
                modelValue: '==Alpha==',
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

        const highlight = wrapper.get('mark.markdown-highlight');
        expect(highlight.text()).toBe('Alpha');
    });

    it('preserves viewer scroll position when external content sync replaces the markdown document', async () => {
        createMarkdownEditor.mockImplementation(async ({ root }: { root: HTMLElement }) => {
            root.innerHTML = `
              <div class="milkdown">
                <div class="ProseMirror">
                  <p>Alpha</p>
                </div>
              </div>
            `;
            return { content: 'Alpha' };
        });
        replaceMarkdownDocument.mockImplementation(() => {
            const shell = document.querySelector('[data-testid="document-editor-scroll-shell"]') as HTMLElement | null;
            if (shell) {
                shell.scrollTop = 0;
            }
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
                modelValue: 'Alpha',
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

        const scrollShell = wrapper.get('[data-testid="document-editor-scroll-shell"]').element as HTMLElement;
        scrollShell.scrollTop = 240;

        await wrapper.setProps({ modelValue: 'Alpha\n\nBeta' });
        await Promise.resolve();
        await wrapper.vm.$nextTick();

        expect(replaceMarkdownDocument).toHaveBeenCalledWith(expect.anything(), 'Alpha\n\nBeta');
        expect(scrollShell.scrollTop).toBe(240);
    });

    it('restores viewer scroll position after switching from edit mode back to viewer mode', async () => {
        const rafQueue: FrameRequestCallback[] = [];
        vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
            rafQueue.push(callback);
            return rafQueue.length;
        }) as typeof window.requestAnimationFrame);

        const flushAnimationFrames = (passes: number) => {
            for (let index = 0; index < passes; index += 1) {
                const callbacks = rafQueue.splice(0, rafQueue.length);
                callbacks.forEach((callback) => callback(0));
            }
        };

        let creationCount = 0;
        createMarkdownEditor.mockImplementation(async ({ root }: { root: HTMLElement }) => {
            creationCount += 1;
            root.innerHTML = `
              <div class="milkdown">
                <div class="ProseMirror">
                  <p>Alpha</p>
                </div>
              </div>
            `;
            if (creationCount === 2) {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        const shell = root.closest('[data-testid="document-editor-scroll-shell"]') as HTMLElement | null;
                        if (shell) {
                            shell.scrollTop = 0;
                        }
                    });
                });
            }
            return { content: 'Alpha' };
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
                modelValue: 'Alpha',
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

        const scrollShell = wrapper.get('[data-testid="document-editor-scroll-shell"]').element as HTMLElement;
        scrollShell.scrollTop = 240;

        await wrapper.setProps({ markdownViewerMode: 'edit' });
        await Promise.resolve();
        await wrapper.vm.$nextTick();
        await Promise.resolve();
        await wrapper.vm.$nextTick();

        await wrapper.setProps({ markdownViewerMode: 'viewer' });
        await Promise.resolve();
        await wrapper.vm.$nextTick();
        await Promise.resolve();
        await wrapper.vm.$nextTick();

        flushAnimationFrames(6);

        expect(scrollShell.scrollTop).toBe(240);
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

    it('places the caret inside an empty highlight insertion in edit mode', async () => {
        const { default: MarkdownDocumentViewer } = await import('./MarkdownDocumentViewer.vue');
        const Harness = defineComponent({
            components: { MarkdownDocumentViewer },
            setup() {
                const modelValue = ref('Read ');
                const applyUpdate = async (value: string) => {
                    await nextTick();
                    modelValue.value = value;
                };

                return {
                    applyUpdate,
                    modelValue
                };
            },
            template: `
              <MarkdownDocumentViewer
                :active-path="'/docs/guide.md'"
                :active-document="{ path: '/docs/guide.md', mimeType: 'text/markdown', dataBase64: '', canWrite: true }"
                :model-value="modelValue"
                markdown-viewer-mode="edit"
                :latest-file-change="null"
                :diff-entries="[]"
                :can-undo="false"
                :can-redo="false"
                :middle-pane-zoom="1"
                @update:model-value="applyUpdate"
              />
            `
        });
        const wrapper = mount(Harness, {
            attachTo: document.body
        });

        await Promise.resolve();
        await wrapper.vm.$nextTick();

        const viewer = wrapper.findComponent(MarkdownDocumentViewer);
        const textarea = viewer.get('[data-testid="document-editor-input"]').element as HTMLTextAreaElement;
        textarea.focus();
        textarea.setSelectionRange(5, 5);
        (viewer.vm as unknown as {
            insertMarkdownSnippet: (input: {
                buildReplacement: (selectedText: string) => string;
                resolveCaret: (input: {
                    selectionStart: number;
                    selectedText: string;
                    replacement: string;
                }) => { start: number; end: number };
            }) => boolean;
        }).insertMarkdownSnippet({
            buildReplacement: (selectedText) => selectedText ? `==${selectedText}==` : '====',
            resolveCaret: ({ selectionStart, selectedText, replacement }) => {
                if (selectedText) {
                    const end = selectionStart + replacement.length;
                    return { start: end, end };
                }
                const caret = selectionStart + 2;
                return { start: caret, end: caret };
            }
        });

        await Promise.resolve();
        await wrapper.vm.$nextTick();
        await wrapper.vm.$nextTick();

        expect((wrapper.vm as unknown as { modelValue: string }).modelValue).toBe('Read ====');
        expect(textarea.selectionStart).toBe(7);
        expect(textarea.selectionEnd).toBe(7);
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

    it('suppresses bootstrap echoes for frontmatter documents but still emits later viewer edits', async () => {
        let capturedOnChange: ((markdown: string) => void) | undefined;
        createMarkdownEditor.mockImplementation(async (options: { onChange: (markdown: string) => void }) => {
            capturedOnChange = options.onChange;
            options.onChange('# Body');
            return { content: '# Body' };
        });

        const sourceWithFrontmatter = [
            '---',
            'jarvis_id: doc-1',
            '---',
            '# Body'
        ].join('\n');

        const { default: MarkdownDocumentViewer } = await import('./MarkdownDocumentViewer.vue');
        const wrapper = mount(MarkdownDocumentViewer, {
            props: {
                activePath: '/docs/frontmatter.md',
                activeDocument: {
                    path: '/docs/frontmatter.md',
                    mimeType: 'text/markdown',
                    dataBase64: '',
                    canWrite: true
                },
                modelValue: sourceWithFrontmatter,
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

        expect(wrapper.emitted('update:modelValue')).toBeUndefined();

        const updatedMarkdown = [
            '---',
            'jarvis_id: doc-1',
            '---',
            '# Body updated'
        ].join('\n');
        capturedOnChange?.(updatedMarkdown);
        await wrapper.vm.$nextTick();

        expect(wrapper.emitted('update:modelValue')).toEqual([[updatedMarkdown]]);
    });

    it('still emits viewer edits after switching away and back to the same markdown document', async () => {
        const onChangeHandlers: Array<(markdown: string) => void> = [];
        createMarkdownEditor.mockImplementation(async (options: { onChange: (markdown: string) => void; content: string }) => {
            onChangeHandlers.push(options.onChange);
            return { content: options.content };
        });

        const { default: MarkdownDocumentViewer } = await import('./MarkdownDocumentViewer.vue');
        const wrapper = mount(MarkdownDocumentViewer, {
            props: {
                activePath: '/docs/a.md',
                activeDocument: {
                    path: '/docs/a.md',
                    mimeType: 'text/markdown',
                    dataBase64: '',
                    canWrite: true
                },
                modelValue: '# A',
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

        await wrapper.setProps({
            activePath: '/docs/b.md',
            activeDocument: {
                path: '/docs/b.md',
                mimeType: 'text/markdown',
                dataBase64: '',
                canWrite: true
            },
            modelValue: '# B'
        });

        await Promise.resolve();
        await Promise.resolve();
        await wrapper.vm.$nextTick();

        await wrapper.setProps({
            activePath: '/docs/a.md',
            activeDocument: {
                path: '/docs/a.md',
                mimeType: 'text/markdown',
                dataBase64: '',
                canWrite: true
            },
            modelValue: '# A'
        });

        await Promise.resolve();
        await Promise.resolve();
        await wrapper.vm.$nextTick();

        expect(createMarkdownEditor).toHaveBeenCalledTimes(3);

        const updatedMarkdown = '# A updated after switch';
        onChangeHandlers.at(-1)?.(updatedMarkdown);
        await wrapper.vm.$nextTick();

        expect(wrapper.emitted('update:modelValue')?.at(0)).toEqual([updatedMarkdown]);
    });

    it('captures any Milkdown context-missing error (editorView/editorState) with navigation context and a lifecycle dump', async () => {
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

        // The real bug surfaces as a detached unhandledrejection with "editorState".
        const rejectionEvent = new Event('unhandledrejection') as Event & { reason?: unknown };
        rejectionEvent.reason = new Error('Context "editorState" not found, do you forget to inject it?');
        window.dispatchEvent(rejectionEvent);

        expect(consoleDebug).toHaveBeenCalledWith(
            '[markdown-viewer] editor-context-missing',
            expect.objectContaining({
                source: 'unhandledrejection',
                message: 'Context "editorState" not found, do you forget to inject it?',
                activePath: '/docs/guide.md',
                markdownViewerMode: 'viewer',
                navigatingAway: true,
                lastNavigationTarget: {
                    kind: 'document',
                    path: '/docs/next.md'
                },
                lifecycleTrace: expect.any(Array)
            })
        );

        consoleDebug.mockRestore();
    });

    it('applyLinkInViewer calls applyMarkdownLinkAtViewerSelection with the editor and input', async () => {
        const mockEditor = { content: 'mock-editor' };
        createMarkdownEditor.mockResolvedValue(mockEditor);
        applyMarkdownLinkAtViewerSelection.mockReturnValue(true);

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
                modelValue: 'Hello world',
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

        const result = (wrapper.vm as unknown as { applyLinkInViewer: (input: { label: string; href: string }) => boolean })
            .applyLinkInViewer({ label: 'Reference', href: './reference.md' });

        expect(result).toBe(true);
        expect(applyMarkdownLinkAtViewerSelection).toHaveBeenCalledTimes(1);
        expect(applyMarkdownLinkAtViewerSelection).toHaveBeenCalledWith(
            mockEditor,
            { label: 'Reference', href: './reference.md' }
        );
    });

    it('insertMarkdownLink dispatches to applyLinkInViewer in viewer mode', async () => {
        const mockEditor = { content: 'mock-editor' };
        createMarkdownEditor.mockResolvedValue(mockEditor);
        applyMarkdownLinkAtViewerSelection.mockReturnValue(true);

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
                modelValue: 'Hello world',
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

        const result = (wrapper.vm as unknown as { insertMarkdownLink: (input: { label: string; href: string }) => boolean })
            .insertMarkdownLink({ label: 'Reference', href: './reference.md' });

        expect(result).toBe(true);
        expect(applyMarkdownLinkAtViewerSelection).toHaveBeenCalledTimes(1);
        expect(applyMarkdownLinkAtViewerSelection).toHaveBeenCalledWith(
            mockEditor,
            { label: 'Reference', href: './reference.md' }
        );
    });
});
