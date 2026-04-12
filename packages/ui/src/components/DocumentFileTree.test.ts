// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import DocumentFileTree from './DocumentFileTree.vue';

describe('DocumentFileTree', () => {
    it('renders icon actions with floating tooltip labels', async () => {
        const wrapper = mount(DocumentFileTree, {
            props: {
                nodes: [],
                expandedPaths: [],
                activePath: null,
                currentError: null
            }
        });

        expect(wrapper.get('[data-testid="document-new-file"]').attributes('title')).toBe('New file');
        expect(wrapper.get('[data-testid="document-new-file"]').attributes('aria-label')).toBe('New file');
        expect(wrapper.get('[data-testid="document-refresh-tree"]').attributes('title')).toBe('Refresh file tree');
        expect(wrapper.get('[data-testid="document-refresh-tree"]').attributes('aria-label')).toBe('Refresh file tree');
        expect(wrapper.get('[data-testid="document-delete-node"]').attributes('title')).toBe('Delete selected node');
        expect(wrapper.get('[data-testid="document-delete-node"]').attributes('aria-label')).toBe('Delete selected node');
        expect(wrapper.get('[data-testid="document-new-directory"]').attributes('title')).toBe('New directory');
        expect(wrapper.get('[data-testid="document-new-directory"]').attributes('aria-label')).toBe('New directory');
        expect(wrapper.get('[data-testid="document-node-root"]').text()).toContain('Root');

        await wrapper.get('[data-testid="document-new-file"]').trigger('mouseenter');
        expect(document.body.textContent).toContain('New file');
        await wrapper.get('[data-testid="document-new-file"]').trigger('mouseleave');
        expect(document.body.textContent).not.toContain('New file');

        await wrapper.get('[data-testid="document-new-directory"]').trigger('focus');
        expect(document.body.textContent).toContain('New directory');
        await wrapper.get('[data-testid="document-new-directory"]').trigger('blur');
        expect(document.body.textContent).not.toContain('New directory');
    });

    it('creates pending nodes inline and emits create events with the resolved parent path', async () => {
        const wrapper = mount(DocumentFileTree, {
            props: {
                nodes: [
                    { path: '/docs', name: 'docs', kind: 'directory', isAgentOwner: true, agentKey: '/docs/.agent.json' },
                    { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' }
                ],
                expandedPaths: ['/', '/docs'],
                activePath: '/docs/guide.md',
                currentError: null
            }
        });

        expect(wrapper.get('[data-path="/docs"]').find('[data-testid="document-node-agent-owner"]').exists()).toBe(true);

        await wrapper.get('[data-testid="document-new-file"]').trigger('click');
        await wrapper.get('[data-testid="document-pending-node-input"]').setValue('note.md');
        await wrapper.get('[data-testid="document-pending-node-input"]').trigger('keydown.enter');

        await wrapper.setProps({
            activePath: '/docs'
        });
        await wrapper.get('[data-testid="document-new-directory"]').trigger('click');
        await wrapper.get('[data-testid="document-pending-node-input"]').setValue('archive');
        await wrapper.get('[data-testid="document-pending-node-input"]').trigger('blur');

        expect(wrapper.emitted('create')).toEqual([
            [{ name: 'note.md', kind: 'file', parentPath: '/docs' }],
            [{ name: 'archive', kind: 'directory', parentPath: '/docs' }]
        ]);
    });

    it('cancels pending creation on escape and emits refresh events', async () => {
        const wrapper = mount(DocumentFileTree, {
            props: {
                nodes: [],
                expandedPaths: ['/'],
                activePath: '/',
                currentError: null
            }
        });

        await wrapper.get('[data-testid="document-new-file"]').trigger('click');
        expect(wrapper.get('[data-testid="document-pending-node-input"]').exists()).toBe(true);
        await wrapper.get('[data-testid="document-pending-node-input"]').trigger('keydown.esc');
        expect(wrapper.find('[data-testid="document-pending-node-input"]').exists()).toBe(false);

        await wrapper.get('[data-testid="document-refresh-tree"]').trigger('click');
        expect(wrapper.emitted('refresh')).toHaveLength(1);
    });

    it('requires confirmation before deleting the selected node', async () => {
        const wrapper = mount(DocumentFileTree, {
            props: {
                nodes: [
                    { path: '/docs', name: 'docs', kind: 'directory' },
                    { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' }
                ],
                expandedPaths: ['/', '/docs'],
                activePath: '/docs/guide.md',
                currentError: null
            }
        });

        await wrapper.get('[data-testid="document-delete-node"]').trigger('click');
        expect(wrapper.get('[data-testid="document-delete-confirm"]').text()).toContain('guide.md');
        await wrapper.get('[data-testid="document-delete-confirm-no"]').trigger('click');
        expect(wrapper.find('[data-testid="document-delete-confirm"]').exists()).toBe(false);

        await wrapper.get('[data-testid="document-delete-node"]').trigger('click');
        await wrapper.get('[data-testid="document-delete-confirm-yes"]').trigger('click');
        expect(wrapper.emitted('delete')).toEqual([
            ['/docs/guide.md']
        ]);
    });

    it('enters inline rename mode on double click and emits rename on confirm', async () => {
        const wrapper = mount(DocumentFileTree, {
            props: {
                nodes: [
                    { path: '/docs', name: 'docs', kind: 'directory' },
                    { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' }
                ],
                expandedPaths: ['/', '/docs'],
                activePath: '/docs/guide.md',
                currentError: null
            }
        });

        await wrapper.get('[data-path="/docs/guide.md"]').trigger('dblclick');
        await wrapper.get('[data-testid="document-rename-node-input"]').setValue('renamed.md');
        await wrapper.get('[data-testid="document-rename-node-input"]').trigger('keydown.enter');

        expect(wrapper.emitted('rename')).toEqual([
            [{ path: '/docs/guide.md', name: 'renamed.md' }]
        ]);
    });
});
