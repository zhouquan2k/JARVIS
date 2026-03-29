// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

const createMarkdownEditor = vi.fn();
const replaceMarkdownDocument = vi.fn();
const readMarkdownDocument = vi.fn();
const destroyMarkdownEditor = vi.fn();

vi.mock('../utils/markdownDocument', () => ({
    createMarkdownEditor,
    replaceMarkdownDocument,
    readMarkdownDocument,
    destroyMarkdownEditor
}));

describe('KnowledgeEditorPane', () => {
    beforeEach(() => {
        createMarkdownEditor.mockReset();
        replaceMarkdownDocument.mockReset();
        readMarkdownDocument.mockReset();
        destroyMarkdownEditor.mockReset();
    });

    it('creates a Milkdown-backed editor and emits markdown updates', async () => {
        let onChange: ((markdown: string) => void) | undefined;
        const editor = { content: '# Today' };
        createMarkdownEditor.mockImplementation(async (options: { onChange: (markdown: string) => void }) => {
            onChange = options.onChange;
            return editor;
        });
        readMarkdownDocument.mockImplementation((value: { content: string }) => value.content);

        const { default: KnowledgeEditorPane } = await import('./KnowledgeEditorPane.vue');
        const wrapper = mount(KnowledgeEditorPane, {
            props: {
                activePath: '/notes/today.md',
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

        const { default: KnowledgeEditorPane } = await import('./KnowledgeEditorPane.vue');
        const wrapper = mount(KnowledgeEditorPane, {
            props: {
                activePath: '/welcome.md',
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

        const { default: KnowledgeEditorPane } = await import('./KnowledgeEditorPane.vue');
        const wrapper = mount(KnowledgeEditorPane, {
            props: {
                activePath: '/draft.md',
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

        expect(wrapper.get('[data-testid="knowledge-save"]').attributes('title')).toBe('保存');
        expect(wrapper.get('[data-testid="knowledge-save"]').attributes('aria-label')).toBe('保存');
        await wrapper.get('[data-testid="knowledge-save"]').trigger('mouseenter');
        expect(document.body.textContent).toContain('保存');
        await wrapper.get('[data-testid="knowledge-save"]').trigger('mouseleave');
        expect(document.body.textContent).not.toContain('保存');
        await wrapper.get('[data-testid="knowledge-save"]').trigger('click');
        expect(wrapper.emitted('save')).toHaveLength(1);

        await wrapper.unmount();
        expect(destroyMarkdownEditor).toHaveBeenCalledWith(editor);
    });
});
