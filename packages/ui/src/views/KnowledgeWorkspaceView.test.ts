// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createMockContextProvider } from '@packages/core/src';
import KnowledgeWorkspaceView from './KnowledgeWorkspaceView.vue';

describe('KnowledgeWorkspaceView', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('renders the three-pane knowledge workspace shell', async () => {
        const wrapper = mount(KnowledgeWorkspaceView, {
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
                    KnowledgeAssistantPane: {
                        props: ['activeAgent', 'agentResolutionError', 'isResolvingAgent'],
                        template: `
                          <div
                            data-testid="knowledge-assistant-pane"
                            :data-agent-name="activeAgent?.name ?? ''"
                            :data-agent-error="agentResolutionError ?? ''"
                            :data-agent-loading="isResolvingAgent === true"
                          />
                        `
                    },
                    KnowledgeEditorPane: {
                        template: '<div data-testid="knowledge-editor" />'
                    }
                }
            }
        });

        await flushPromises();
        await wrapper.vm.$nextTick();

        expect(wrapper.get('[data-testid="knowledge-workspace"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="knowledge-file-tree"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="knowledge-editor"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="knowledge-assistant-pane"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="knowledge-assistant-pane"]').attributes('data-agent-name')).toBe('Root Agent');
        expect(wrapper.get('.knowledge-grid').attributes('style')).toContain('100% - 8px');
        expect(wrapper.findAll('.grid-pane')).toHaveLength(3);
    });

    it('allows the host to override the default assistant pane through the slot', async () => {
        const wrapper = mount(KnowledgeWorkspaceView, {
            props: {
                contextProvider: createMockContextProvider()
            },
            global: {
                stubs: {
                    KnowledgeAssistantPane: {
                        template: '<div data-testid="knowledge-assistant-pane" />'
                    },
                    KnowledgeEditorPane: {
                        template: '<div data-testid="knowledge-editor" />'
                    }
                }
            },
            slots: {
                'assistant-pane': '<div data-testid="assistant-slot">custom pane</div>'
            }
        });

        await flushPromises();
        await wrapper.vm.$nextTick();

        expect(wrapper.find('[data-testid="knowledge-assistant-pane"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="assistant-slot"]').text()).toContain('custom pane');
    });
});
