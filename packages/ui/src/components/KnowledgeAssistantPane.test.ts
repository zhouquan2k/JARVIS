// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import KnowledgeAssistantPane from './KnowledgeAssistantPane.vue';
import { useChatStore } from '../store/chat';

describe('KnowledgeAssistantPane', () => {
    it('mounts the normal chat view and renders active agent metadata', () => {
        setActivePinia(createPinia());
        const wrapper = mount(KnowledgeAssistantPane, {
            props: {
                activeAgent: {
                    name: 'Docs Agent',
                    description: 'Handle docs',
                    instructions: 'Use docs context',
                    effectiveInstructions: 'Use docs context',
                    modelProviderName: 'gemini-api',
                    modelName: 'gemini-2.5-pro',
                    scopePath: '/docs',
                    sourcePaths: ['/docs/.agent.json']
                }
            },
            global: {
                stubs: {
                    NormalChatView: {
                        template: '<div data-testid="normal-chat-stub" />'
                    }
                }
            }
        });

        expect(wrapper.get('[data-testid="knowledge-assistant-pane"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="normal-chat-stub"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="knowledge-agent-name"]').text()).toContain('Docs Agent（/docs）');
        expect(wrapper.get('[data-testid="knowledge-agent-model"]').text()).toContain('gemini-api / gemini-2.5-pro');
        expect(wrapper.text()).toContain('Docs Agent（/docs）');
        expect(wrapper.text()).toContain('gemini-api / gemini-2.5-pro');
    });

    it('prefers the nearest matched agent config directory over the current scope path', () => {
        setActivePinia(createPinia());
        const wrapper = mount(KnowledgeAssistantPane, {
            props: {
                activeAgent: {
                    name: 'Archive Agent',
                    effectiveInstructions: 'Use archive context',
                    modelProviderName: 'gemini-api',
                    modelName: 'gemini-2.5-pro',
                    scopePath: '/workspace/archive/reports',
                    sourcePaths: ['/workspace/.agent.json', '/workspace/archive/.agent.json']
                }
            },
            global: {
                stubs: {
                    NormalChatView: {
                        template: '<div data-testid="normal-chat-stub" />'
                    }
                }
            }
        });

        expect(wrapper.get('[data-testid="knowledge-agent-name"]').text()).toContain('Archive Agent（/workspace/archive）');
        expect(wrapper.get('[data-testid="knowledge-agent-name"]').text()).not.toContain('/workspace/archive/reports');
    });

    it('shows root scope for the default agent when no scoped config is matched', () => {
        setActivePinia(createPinia());
        const wrapper = mount(KnowledgeAssistantPane, {
            props: {
                activeAgent: {
                    name: 'Default Knowledge Agent',
                    effectiveInstructions: 'Use workspace context',
                    scopePath: '/',
                    sourcePaths: []
                }
            },
            global: {
                stubs: {
                    NormalChatView: {
                        template: '<div data-testid="normal-chat-stub" />'
                    }
                }
            }
        });

        expect(wrapper.get('[data-testid="knowledge-agent-name"]').text()).toContain('Default Knowledge Agent（/）');
    });

    it('syncs and clears the chat agent context with the pane lifecycle', async () => {
        setActivePinia(createPinia());
        const chatStore = useChatStore();
        const wrapper = mount(KnowledgeAssistantPane, {
            props: {
                activeAgent: {
                    name: 'Docs Agent',
                    effectiveInstructions: 'Use docs context',
                    modelProviderName: 'gemini-api',
                    modelName: 'gemini-2.5-flash',
                    scopePath: '/docs',
                    sourcePaths: ['/docs/.agent.json']
                }
            },
            global: {
                stubs: {
                    NormalChatView: {
                        template: '<div data-testid="normal-chat-stub" />'
                    }
                }
            }
        });

        expect(chatStore.activeAgentContext?.name).toBe('Docs Agent');

        await wrapper.setProps({
            activeAgent: {
                name: 'Archive Agent',
                effectiveInstructions: 'Use archive context',
                modelProviderName: 'gemini-api',
                modelName: 'gemini-2.5-pro',
                scopePath: '/archive',
                sourcePaths: ['/archive/.agent.json']
            }
        });

        expect(chatStore.activeAgentContext?.name).toBe('Archive Agent');

        wrapper.unmount();
        expect(chatStore.activeAgentContext).toBeNull();
    });
});
