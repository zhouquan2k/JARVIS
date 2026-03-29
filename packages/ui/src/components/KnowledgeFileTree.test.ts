// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import KnowledgeFileTree from './KnowledgeFileTree.vue';

describe('KnowledgeFileTree', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders icon actions with floating tooltip labels', async () => {
        const wrapper = mount(KnowledgeFileTree, {
            props: {
                nodes: [],
                expandedPaths: [],
                activePath: null,
                currentError: null
            }
        });

        expect(wrapper.get('[data-testid="knowledge-new-file"]').attributes('title')).toBe('新建文件');
        expect(wrapper.get('[data-testid="knowledge-new-file"]').attributes('aria-label')).toBe('新建文件');
        expect(wrapper.get('[data-testid="knowledge-new-directory"]').attributes('title')).toBe('新建目录');
        expect(wrapper.get('[data-testid="knowledge-new-directory"]').attributes('aria-label')).toBe('新建目录');

        await wrapper.get('[data-testid="knowledge-new-file"]').trigger('mouseenter');
        expect(document.body.textContent).toContain('新建文件');
        await wrapper.get('[data-testid="knowledge-new-file"]').trigger('mouseleave');
        expect(document.body.textContent).not.toContain('新建文件');

        await wrapper.get('[data-testid="knowledge-new-directory"]').trigger('focus');
        expect(document.body.textContent).toContain('新建目录');
        await wrapper.get('[data-testid="knowledge-new-directory"]').trigger('blur');
        expect(document.body.textContent).not.toContain('新建目录');
    });

    it('emits create events from the icon actions', async () => {
        vi.spyOn(window, 'prompt')
            .mockReturnValueOnce('note.md')
            .mockReturnValueOnce('docs');

        const wrapper = mount(KnowledgeFileTree, {
            props: {
                nodes: [],
                expandedPaths: [],
                activePath: null,
                currentError: null
            }
        });

        await wrapper.get('[data-testid="knowledge-new-file"]').trigger('click');
        await wrapper.get('[data-testid="knowledge-new-directory"]').trigger('click');

        expect(wrapper.emitted('create')).toEqual([
            [{ name: 'note.md', kind: 'file' }],
            [{ name: 'docs', kind: 'directory' }]
        ]);
    });
});
