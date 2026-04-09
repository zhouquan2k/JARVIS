// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import type { Conversation, IConversationPersistProvider, IModelProvider } from '@packages/core/src';
import { createMockContextProvider } from '@packages/core/src';
import DocumentWorkspaceView from './DocumentWorkspaceView.vue';
import { useChatStore } from '../store/chat';
import { useDocumentWorkspaceStore } from '../store/documentWorkspace';

class MockConversationStorage implements IConversationPersistProvider {
    constructor(private conversations: Conversation[]) {}

    async saveConversation(conversation: Conversation): Promise<void> {
        const index = this.conversations.findIndex((item) => item.id === conversation.id);
        if (index >= 0) {
            this.conversations[index] = conversation;
            return;
        }

        this.conversations.unshift(conversation);
    }

    async getConversation(id: string): Promise<Conversation | null> {
        return this.conversations.find((conversation) => conversation.id === id) || null;
    }

    async getAllConversations(): Promise<Conversation[]> {
        return [...this.conversations];
    }

    async deleteConversation(id: string): Promise<void> {
        this.conversations = this.conversations.filter((conversation) => conversation.id !== id);
    }

    async syncNow(): Promise<void> {}
}

function createMockModelProvider(): IModelProvider {
    return {
        id: 'mock-provider',
        getAvailableModels: async () => ({ models: [{ id: 'mock-model', name: 'Mock Model' }], defaultModel: 'mock-model' }),
        checkAuth: async () => true,
        getDocumentCapability: async () => ({ acceptedMimeTypes: ['text/plain', 'text/markdown'] }),
        sendMessage: async () => ({ text: '', conversationId: 'conversation-1', messageId: 'message-1' }),
        abort: () => undefined
    } as IModelProvider;
}

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

    it('tells the assistant pane to show the agent conversation list for selected owner directories', async () => {
        const wrapper = mount(DocumentWorkspaceView, {
            props: {
                contextProvider: createMockContextProvider({
                    nodes: [
                        { path: '/docs', name: 'docs', kind: 'directory' },
                        { path: '/docs/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/docs' },
                        { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' }
                    ],
                    documents: {
                        '/docs/.agent.json': JSON.stringify({
                            name: 'Docs Agent',
                            instructions: 'Handle docs.'
                        }),
                        '/docs/guide.md': '# Guide'
                    }
                })
            },
            global: {
                stubs: {
                    AgentPane: {
                        props: ['showAgentConversationList', 'activeAgentKey'],
                        template: `
                          <div
                            data-testid="agent-pane"
                            :data-show-agent-conversation-list="showAgentConversationList === true"
                            :data-agent-key="activeAgentKey ?? ''"
                          />
                        `
                    },
                    AgentView: { template: '<div data-testid="agent-view-stub" />' },
                    DocumentEditorPane: { template: '<div data-testid="document-editor" />' }
                }
            }
        });

        await flushPromises();
        await wrapper.get('[data-path="/docs"]').trigger('click');
        await flushPromises();

        expect(wrapper.get('[data-testid="agent-pane"]').attributes('data-show-agent-conversation-list')).toBe('true');
        expect(wrapper.get('[data-testid="agent-pane"]').attributes('data-agent-key')).toBe('/docs/');
    });

    it('forwards workspace switch requests from the agent pane', async () => {
        const wrapper = mount(DocumentWorkspaceView, {
            props: {
                contextProvider: createMockContextProvider({
                    nodes: [
                        { path: '/docs', name: 'docs', kind: 'directory' },
                        { path: '/docs/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/docs' }
                    ],
                    documents: {
                        '/docs/.agent.json': JSON.stringify({
                            name: 'Docs Agent',
                            instructions: 'Handle docs.'
                        })
                    }
                })
            },
            global: {
                stubs: {
                    AgentPane: {
                        template: '<button data-testid="agent-pane-switch" @click="$emit(\'request-workspace-switch\', \'/chat\')" />'
                    },
                    DocumentEditorPane: {
                        template: '<div data-testid="document-editor" />'
                    }
                }
            }
        });

        await flushPromises();
        await wrapper.get('[data-testid="agent-pane-switch"]').trigger('click');

        expect(wrapper.emitted('request-workspace-switch')).toEqual([['/chat']]);
    });

    it('restores the saved agent conversation and document selection when remounting', async () => {
        const chatStore = useChatStore();
        const storage = new MockConversationStorage([
            {
                id: 'conversation-saved',
                title: 'Saved Chat',
                origin: 'local',
                updatedAt: 10,
                messages: []
            },
            {
                id: 'conversation-current',
                title: 'Current Chat',
                origin: 'local',
                updatedAt: 9,
                messages: []
            }
        ]);

        chatStore.setProviders(createMockModelProvider(), storage);
        chatStore.currentConversation = {
            id: 'conversation-current',
            title: 'Current Chat',
            origin: 'local',
            updatedAt: 9,
            messages: []
        };
        chatStore.saveAgentViewStatus({
            selectedNodePath: '/docs',
            activePath: '/docs/guide.md',
            activeConversationId: 'conversation-saved'
        });

        const wrapper = mount(DocumentWorkspaceView, {
            props: {
                contextProvider: createMockContextProvider({
                    nodes: [
                        { path: '/docs', name: 'docs', kind: 'directory' },
                        { path: '/docs/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/docs' },
                        { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' },
                        { path: '/other.md', name: 'other.md', kind: 'file' }
                    ],
                    documents: {
                        '/docs/.agent.json': JSON.stringify({
                            name: 'Docs Agent',
                            instructions: 'Handle docs.'
                        }),
                        '/docs/guide.md': '# Guide',
                        '/other.md': '# Other'
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

        expect(chatStore.currentConversation?.id).toBe('conversation-saved');
        expect(chatStore.workspaceMode).toBe('conversation');
        expect(chatStore.historySource).toBe('local');

        const documentStore = useDocumentWorkspaceStore();
        expect(documentStore.selectedNodePath).toBe('/docs');
        expect(documentStore.activePath).toBe('/docs/guide.md');
        expect(documentStore.activeDocument?.path).toBe('/docs/guide.md');
        expect(documentStore.expandedPaths).toContain('/docs');
        expect(documentStore.isAgentOwnerSelected).toBe(true);

        await wrapper.get('[data-path="/other.md"]').trigger('click');
        await flushPromises();

        expect(chatStore.currentConversation).toBeNull();
        expect(documentStore.selectedNodePath).toBe('/other.md');
        expect(documentStore.activePath).toBe('/other.md');
    });

    it('restores a saved file selection, directory selection and stale fallback path', async () => {
        const contextProvider = createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' },
                { path: '/docs/archive', name: 'archive', kind: 'directory', parentPath: '/docs' }
            ],
            documents: {
                '/docs/guide.md': '# Guide'
            }
        });

        const wrapper = mount(DocumentWorkspaceView, {
            props: {
                contextProvider
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

        const documentStore = useDocumentWorkspaceStore();

        await documentStore.restoreSelection({
            selectedNodePath: '/docs/guide.md',
            activePath: '/docs/guide.md'
        });
        expect(documentStore.selectedNodePath).toBe('/docs/guide.md');
        expect(documentStore.activePath).toBe('/docs/guide.md');
        expect(documentStore.activeDocument?.path).toBe('/docs/guide.md');
        expect(documentStore.expandedPaths).toContain('/docs');

        await documentStore.restoreSelection({
            selectedNodePath: '/docs',
            activePath: null
        });
        expect(documentStore.selectedNodePath).toBe('/docs');
        expect(documentStore.activePath).toBeNull();
        expect(documentStore.activeDocument).toBeNull();
        expect(documentStore.expandedPaths).toContain('/docs');

        await documentStore.restoreSelection({
            selectedNodePath: '/docs/archive/old.md',
            activePath: '/docs/archive/old.md'
        });
        expect(documentStore.selectedNodePath).toBe('/docs/archive');
        expect(documentStore.activePath).toBeNull();
        expect(documentStore.activeDocument).toBeNull();
    });
});
