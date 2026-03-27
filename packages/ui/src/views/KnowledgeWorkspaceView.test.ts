// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
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
                        { path: '/welcome.md', name: 'welcome.md', kind: 'file' }
                    ],
                    documents: {
                        '/welcome.md': '# Welcome'
                    }
                })
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
            }
        });

        await Promise.resolve();
        await wrapper.vm.$nextTick();

        expect(wrapper.get('[data-testid="knowledge-workspace"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="knowledge-file-tree"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="knowledge-editor"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="knowledge-assistant-pane"]').exists()).toBe(true);
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

        await Promise.resolve();
        await wrapper.vm.$nextTick();

        expect(wrapper.find('[data-testid="knowledge-assistant-pane"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="assistant-slot"]').text()).toContain('custom pane');
    });
});
