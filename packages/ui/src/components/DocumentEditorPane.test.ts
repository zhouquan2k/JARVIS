// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { encodeTextDocument } from '@packages/core/src';

const createMarkdownEditor = vi.fn();
const replaceMarkdownDocument = vi.fn();
const readMarkdownDocument = vi.fn();
const destroyMarkdownEditor = vi.fn();
const createObjectURL = vi.fn(() => 'blob:pdf-preview');
const revokeObjectURL = vi.fn();

vi.mock('../utils/markdownDocument', () => ({
    createMarkdownEditor,
    replaceMarkdownDocument,
    readMarkdownDocument,
    destroyMarkdownEditor
}));

describe('DocumentEditorPane', () => {
    beforeEach(() => {
        createMarkdownEditor.mockReset();
        replaceMarkdownDocument.mockReset();
        readMarkdownDocument.mockReset();
        destroyMarkdownEditor.mockReset();
        createObjectURL.mockClear();
        revokeObjectURL.mockClear();
        vi.stubGlobal('URL', {
            createObjectURL,
            revokeObjectURL
        });
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
        onChange?.('# Updated');
        await wrapper.vm.$nextTick();

        expect(wrapper.emitted('update:modelValue')).toEqual([[ '# Updated' ]]);
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
});
