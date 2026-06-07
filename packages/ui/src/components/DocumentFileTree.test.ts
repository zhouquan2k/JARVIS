// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import type { ContributionQuery } from '@packages/core/src';
import DocumentFileTree from './DocumentFileTree.vue';
import { contributionQueryKey } from '../plugins/injectionKeys';

function createContributionQuery(overrides: Partial<ContributionQuery> = {}): ContributionQuery {
    return {
        getGlobalViews: () => [],
        getRightPanelTabs: () => [],
        getWorkspaceSelectionViews: () => [],
        getDocumentImports: () => [],
        getLanguageModels: () => [],
        getNodePresentations: () => [],
        ...overrides
    };
}

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
        expect(wrapper.get('[data-testid="document-convert-directory-to-agent"]').attributes('title')).toBe('Convert to Agent/Project');
        expect(wrapper.get('[data-testid="document-convert-directory-to-agent"]').attributes('aria-label')).toBe('Convert to Agent/Project');
        expect(wrapper.get('[data-testid="document-delete-node"]').attributes('title')).toBe('Delete selected node');
        expect(wrapper.get('[data-testid="document-delete-node"]').attributes('aria-label')).toBe('Delete selected node');
        expect(wrapper.get('[data-testid="document-import"]').attributes('title')).toBe('Import document');
        expect(wrapper.get('[data-testid="document-import"]').attributes('aria-label')).toBe('Import document');
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

    it('emits convert-to-agent only for a selected non-agent directory', async () => {
        const wrapper = mount(DocumentFileTree, {
            props: {
                nodes: [
                    { path: '/docs', name: 'docs', kind: 'directory', scopeKey: '/' },
                    { path: '/agent', name: 'agent', kind: 'directory', ownsMetadata: true, scopeKey: '/agent/' }
                ],
                expandedPaths: ['/'],
                activePath: '/docs',
                currentError: null
            }
        });

        expect(wrapper.get('[data-testid="document-convert-directory-to-agent"]').attributes('disabled')).toBeUndefined();
        await wrapper.get('[data-testid="document-convert-directory-to-agent"]').trigger('click');
        expect(wrapper.emitted('convert-to-agent')).toEqual([
            ['/docs']
        ]);

        await wrapper.setProps({ activePath: '/agent' });
        expect(wrapper.get('[data-testid="document-convert-directory-to-agent"]').attributes('disabled')).toBeDefined();
    });

    it('creates pending nodes inline and emits create events with the resolved parent path', async () => {
        const wrapper = mount(DocumentFileTree, {
            props: {
                nodes: [
                    { path: '/docs', name: 'docs', kind: 'directory', ownsMetadata: true, scopeKey: '/docs/.agent.json' },
                    { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' }
                ],
                expandedPaths: ['/', '/docs'],
                activePath: '/docs/guide.md',
                currentError: null
            },
            global: {
                provide: {
                    [contributionQueryKey as symbol]: ref(createContributionQuery({
                        getNodePresentations: () => [{
                            id: 'ai-agent-owner-node',
                            priority: 20,
                            supports: (node) => node.kind === 'directory' && node.ownsMetadata === true,
                            getPresentation: () => ({ icon: 'bot' })
                        }]
                    }))
                }
            }
        });

        await flushPromises();
        await nextTick();
        expect(wrapper.get('[data-path="/docs"]').find('[data-testid="document-node-presentation-icon"]').exists()).toBe(true);
        expect(wrapper.get('[data-path="/docs"]').find('[data-testid="document-node-agent-owner"]').exists()).toBe(true);

        await wrapper.get('[data-testid="document-new-file"]').trigger('click');
        await wrapper.get('[data-testid="document-pending-node-input"]').setValue('note');
        await wrapper.get('[data-testid="document-pending-node-input"]').trigger('keydown.enter');

        await wrapper.setProps({
            activePath: '/docs'
        });
        await wrapper.get('[data-testid="document-new-directory"]').trigger('click');
        await wrapper.get('[data-testid="document-pending-node-input"]').setValue('archive');
        await wrapper.get('[data-testid="document-pending-node-input"]').trigger('blur');

        expect(wrapper.emitted('create')).toEqual([
            [{ name: 'note', kind: 'file', parentPath: '/docs' }],
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

        await wrapper.get('[data-testid="document-import"]').trigger('click');
        expect(wrapper.emitted('import')).toHaveLength(1);
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
        expect((wrapper.get('[data-testid="document-rename-node-input"]').element as HTMLInputElement).value).toBe('guide');
        await wrapper.get('[data-testid="document-rename-node-input"]').setValue('renamed');
        await wrapper.get('[data-testid="document-rename-node-input"]').trigger('keydown.enter');

        expect(wrapper.emitted('rename')).toEqual([
            [{ path: '/docs/guide.md', name: 'renamed' }]
        ]);
    });

    it('emits move when a node is dropped onto a different directory', async () => {
        const wrapper = mount(DocumentFileTree, {
            props: {
                nodes: [
                    { path: '/docs', name: 'docs', kind: 'directory' },
                    { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' },
                    { path: '/archive', name: 'archive', kind: 'directory' }
                ],
                expandedPaths: ['/', '/docs'],
                activePath: '/docs/guide.md',
                currentError: null
            }
        });

        const dataTransfer = {
            setData: () => {},
            effectAllowed: 'move',
            dropEffect: 'move'
        };
        await wrapper.get('[data-path="/docs/guide.md"]').trigger('dragstart', { dataTransfer });
        await wrapper.get('[data-path="/archive"]').trigger('dragover', {
            dataTransfer,
            preventDefault: () => {}
        });
        await wrapper.get('[data-path="/archive"]').trigger('drop', {
            dataTransfer,
            preventDefault: () => {}
        });

        expect(wrapper.emitted('move')).toEqual([
            [{ path: '/docs/guide.md', targetParentPath: '/archive' }]
        ]);
    });

    it('does not emit move when dropping onto the same parent directory', async () => {
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

        const dataTransfer = {
            setData: () => {},
            effectAllowed: 'move',
            dropEffect: 'move'
        };
        await wrapper.get('[data-path="/docs/guide.md"]').trigger('dragstart', { dataTransfer });
        await wrapper.get('[data-path="/docs"]').trigger('drop', {
            dataTransfer,
            preventDefault: () => {}
        });

        expect(wrapper.emitted('move')).toBeUndefined();
    });

    it('hides markdown suffixes while keeping non-markdown file labels and icons', async () => {
        const wrapper = mount(DocumentFileTree, {
            props: {
                nodes: [
                    { path: '/docs', name: 'docs', kind: 'directory' },
                    { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' },
                    { path: '/docs/notes.txt', name: 'notes.txt', kind: 'file', parentPath: '/docs' }
                ],
                expandedPaths: ['/', '/docs'],
                activePath: '/docs/guide.md',
                currentError: null
            }
        });

        expect(wrapper.get('[data-path="/docs/guide.md"]').text()).toContain('guide');
        expect(wrapper.get('[data-path="/docs/guide.md"]').text()).not.toContain('guide.md');
        expect(wrapper.get('[data-path="/docs/notes.txt"]').text()).toContain('notes.txt');
        expect(wrapper.get('[data-path="/docs/notes.txt"]').find('[data-testid="document-node-file-icon"]').attributes('data-icon-kind')).toBe('text');
    });

    it('renders node decorations from plugin contributions instead of hard-coded agent checks', async () => {
        const wrapper = mount(DocumentFileTree, {
            props: {
                nodes: [
                    { path: '/docs', name: 'docs', kind: 'directory', ownsMetadata: true, scopeKey: '/docs/' },
                    { path: '/plain', name: 'plain', kind: 'directory' }
                ],
                expandedPaths: ['/'],
                activePath: '/docs',
                currentError: null
            },
            global: {
                provide: {
                    [contributionQueryKey as symbol]: ref(createContributionQuery({
                        getNodePresentations: () => [{
                            id: 'ai-agent-owner-node',
                            priority: 20,
                            supports: async (node) => node.kind === 'directory' && node.ownsMetadata === true,
                            getPresentation: async () => ({ icon: 'bot', badge: 'Agent', labelSuffix: 'Project' })
                        }]
                    }))
                }
            }
        });

        await flushPromises();
        await nextTick();
        expect(wrapper.get('[data-path="/docs"]').find('[data-testid="document-node-presentation-icon"]').attributes('data-icon-id')).toBe('bot');
        expect(wrapper.get('[data-path="/docs"]').find('[data-testid="document-node-presentation-badge"]').text()).toBe('Agent');
        expect(wrapper.get('[data-path="/docs"]').find('[data-testid="document-node-presentation-suffix"]').text()).toBe('Project');
        expect(wrapper.get('[data-path="/plain"]').find('[data-testid="document-node-presentation-icon"]').exists()).toBe(false);
    });
});
