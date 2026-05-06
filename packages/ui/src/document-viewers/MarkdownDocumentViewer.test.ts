// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';

enableAutoUnmount(afterEach);

const createMarkdownEditor = vi.fn();
const destroyMarkdownEditor = vi.fn();
const normalizeMarkdownViewerContent = vi.fn((content: string) => content);
const readMarkdownDocument = vi.fn((editor: { content: string }) => editor.content);
const replaceMarkdownDocument = vi.fn();
const setMarkdownEditorSearchQuery = vi.fn();
const setMarkdownEditorActiveSearchMatchIndex = vi.fn();
const getMarkdownEditorSearchMatchCount = vi.fn(() => 0);
const scrollToMarkdownEditorSearchMatch = vi.fn();

vi.mock('../utils/markdownDocument', () => ({
    createMarkdownEditor,
    destroyMarkdownEditor,
    normalizeMarkdownViewerContent,
    readMarkdownDocument,
    replaceMarkdownDocument,
    setMarkdownEditorSearchQuery,
    setMarkdownEditorActiveSearchMatchIndex,
    getMarkdownEditorSearchMatchCount,
    scrollToMarkdownEditorSearchMatch
}));

describe('MarkdownDocumentViewer', () => {
    it('enables soft wrapping in markdown edit mode', async () => {
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
});
