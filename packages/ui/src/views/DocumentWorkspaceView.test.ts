// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createMockContextProvider } from '@packages/core/src';
import DocumentWorkspaceView from './DocumentWorkspaceView.vue';

describe('DocumentWorkspaceView', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('renders the three-pane document workspace shell', async () => {
        const wrapper = mount(DocumentWorkspaceView, {
            props: {
                contextProvider: createMockContextProvider({
                    nodes: [
                        { path: '/.agent.json', name: '.agent.json', kind: 'file' },
                        { path: '/welcome.md', name: 'welcome.md', kind: 'file' }
                    ],
                    documents: {
                        '/.agent.json': JSON.stringify({
                            name: 'Root Agent',
                            instructions: 'Handle root files.'
                        }),
                        '/welcome.md': '# Welcome'
                    }
                })
            },
            global: {
                stubs: {
                    AgentPane: {
                        props: ['activeAgent', 'agentResolutionError', 'isResolvingAgent'],
                        template: `
                          <div
                            data-testid="agent-pane"
                            :data-agent-name="activeAgent?.name ?? ''"
                            :data-agent-error="agentResolutionError ?? ''"
                            :data-agent-loading="isResolvingAgent === true"
                          />
                        `
                    },
                    DocumentEditorPane: {
                        template: '<div data-testid="document-editor" />'
                    }
                }
            }
        });

        await flushPromises();
        await wrapper.vm.$nextTick();

        expect(wrapper.get('[data-testid="document-workspace"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="document-file-tree"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="document-editor"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="agent-pane"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="agent-pane"]').attributes('data-agent-name')).toBe('Default Knowledge Agent');
        expect(wrapper.get('.knowledge-grid').attributes('style')).toContain('100% - 8px');
        expect(wrapper.findAll('.grid-pane')).toHaveLength(3);
    });

    it('allows the host to override the default assistant pane through the slot', async () => {
        const wrapper = mount(DocumentWorkspaceView, {
            props: {
                contextProvider: createMockContextProvider()
            },
            global: {
                stubs: {
                    AgentPane: {
                        template: '<div data-testid="agent-pane" />'
                    },
                    DocumentEditorPane: {
                        template: '<div data-testid="document-editor" />'
                    }
                }
            },
            slots: {
                'assistant-pane': '<div data-testid="assistant-slot">custom pane</div>'
            }
        });

        await flushPromises();
        await wrapper.vm.$nextTick();

        expect(wrapper.find('[data-testid="agent-pane"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="assistant-slot"]').text()).toContain('custom pane');
    });

    it('mounts AgentView in the middle pane only for selected owner directories', async () => {
        const wrapper = mount(DocumentWorkspaceView, {
            props: {
                contextProvider: createMockContextProvider({
                    nodes: [
                        { path: '/docs', name: 'docs', kind: 'directory' },
                        { path: '/docs/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/docs' },
                        { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' },
                        { path: '/notes', name: 'notes', kind: 'directory' },
                        { path: '/notes/today.md', name: 'today.md', kind: 'file', parentPath: '/notes' }
                    ],
                    documents: {
                        '/docs/.agent.json': JSON.stringify({
                            name: 'Docs Agent',
                            instructions: 'Handle docs.'
                        }),
                        '/docs/guide.md': '# Guide',
                        '/notes/today.md': '# Today'
                    }
                })
            },
            global: {
                stubs: {
                    AgentPane: { template: '<div data-testid="agent-pane" />' },
                    AgentView: { template: '<div data-testid="agent-view-stub" />' },
                    DocumentEditorPane: { template: '<div data-testid="document-editor" />' }
                }
            }
        });

        await flushPromises();
        await wrapper.get('[data-path="/docs"]').trigger('click');
        await flushPromises();
        expect(wrapper.find('[data-testid="agent-view-stub"]').exists()).toBe(true);

        await wrapper.get('[data-path="/notes"]').trigger('click');
        await flushPromises();
        expect(wrapper.find('[data-testid="agent-view-stub"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="document-editor"]').exists()).toBe(true);
    });
});
