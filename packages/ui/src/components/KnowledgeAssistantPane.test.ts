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
                },
                activePath: '/docs/guide.md',
                activeDocument: {
                    path: '/docs/guide.md',
                    content: '# Guide'
                },
                contextProvider: null,
                onFileChanged: null
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
                },
                activePath: '/workspace/archive/reports/note.md',
                activeDocument: {
                    path: '/workspace/archive/reports/note.md',
                    content: '# Note'
                },
                contextProvider: null,
                onFileChanged: null
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
                },
                activePath: '/welcome.md',
                activeDocument: {
                    path: '/welcome.md',
                    content: '# Welcome'
                },
                contextProvider: null,
                onFileChanged: null
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
                },
                activePath: '/docs/guide.md',
                activeDocument: {
                    path: '/docs/guide.md',
                    content: '# Guide'
                },
                contextProvider: {
                    id: 'workspace-context',
                    initializeAccess: async () => undefined,
                    listTree: async () => [],
                    readDocument: async (path: string) => ({ path, content: '' }),
                    writeDocument: async () => undefined,
                    createNode: async () => ({ path: '/draft.md', name: 'draft.md', kind: 'file' as const }),
                    searchInScope: async () => [],
                    resolveScopedAgentConfig: async () => ({
                        name: 'Docs Agent',
                        effectiveInstructions: 'Use docs context',
                        scopePath: '/docs',
                        sourcePaths: ['/docs/.agent.json']
                    })
                },
                onFileChanged: async () => undefined
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
        expect(chatStore.activeWorkspacePath).toBe('/docs/guide.md');
        expect(chatStore.activeWorkspaceDocument).toEqual({
            path: '/docs/guide.md',
            content: '# Guide'
        });
        expect(chatStore.activeWorkspaceContextProvider?.id).toBe('workspace-context');

        await wrapper.setProps({
            activeAgent: {
                name: 'Archive Agent',
                effectiveInstructions: 'Use archive context',
                modelProviderName: 'gemini-api',
                modelName: 'gemini-2.5-pro',
                scopePath: '/archive',
                sourcePaths: ['/archive/.agent.json']
            },
            activePath: '/archive/log.md',
            activeDocument: {
                path: '/archive/log.md',
                content: '# Archive Log'
            }
        });

        expect(chatStore.activeAgentContext?.name).toBe('Archive Agent');
        expect(chatStore.activeWorkspacePath).toBe('/archive/log.md');
        expect(chatStore.activeWorkspaceDocument).toEqual({
            path: '/archive/log.md',
            content: '# Archive Log'
        });

        wrapper.unmount();
        expect(chatStore.activeAgentContext).toBeNull();
        expect(chatStore.activeWorkspacePath).toBeNull();
        expect(chatStore.activeWorkspaceDocument).toBeNull();
    });
});
