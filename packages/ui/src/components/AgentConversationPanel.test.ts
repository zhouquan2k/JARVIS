// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import type { Conversation, IContextProvider, IConversationPersistProvider, IModelProvider } from '@packages/core/src';
import AgentConversationPanel from './AgentConversationPanel.vue';
import { useChatStore } from '../store/chat';

class MissingConversationStorageProvider implements IConversationPersistProvider {
    id = 'missing-conversation-storage';

    async saveConversation(): Promise<void> {}

    async getConversation(): Promise<Conversation | null> {
        return null;
    }

    async getAllConversations(): Promise<Conversation[]> {
        return [];
    }

    async deleteConversation(): Promise<void> {}
}

class PanelTestModelProvider implements IModelProvider {
    id = 'panel-test-provider';

    async sendMessage(): Promise<{ text: string; conversationId?: string; messageId?: string }> {
        return { text: '' };
    }

    async checkAuth(): Promise<boolean> {
        return true;
    }
}

function createContextProvider(conversations: Conversation[] = []): IContextProvider {
    return {
        id: 'agent-panel-context',
        initializeAccess: vi.fn().mockResolvedValue(undefined),
        getContext: vi.fn().mockResolvedValue({ nodes: [], agentConfigs: {} }),
        getConversations: vi.fn(async (query: { documentPath?: string }) => conversations.filter((conversation) => (
            query.documentPath ? conversation.documentPaths?.includes(query.documentPath) : true
        ))),
        readDocument: vi.fn(),
        writeDocument: vi.fn(),
        createNode: vi.fn(),
        deleteNode: vi.fn(),
        renameNode: vi.fn(),
        searchInScope: vi.fn()
    } as unknown as IContextProvider;
}

describe('AgentConversationPanel', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('emits a workspace switch request when expanding to chat mode', async () => {
        const chatStore = useChatStore();
        chatStore.currentConversation = {
            id: 'conversation-1',
            title: 'Shared Conversation',
            origin: 'local',
            updatedAt: 1,
            messages: []
        };

        const wrapper = mount(AgentConversationPanel, {
            props: {
                activeAgentKey: '/docs/',
                activePath: null,
                selectedNodePath: '/docs',
                activeDocument: null,
                showAgentConversationList: true,
                contextProvider: createContextProvider()
                ,
                restoreConversationId: 'conversation-1'
            },
            global: {
                stubs: {
                    AgentDocumentConversationList: {
                        template: '<div data-testid="agent-document-conversation-list-stub" />'
                    },
                    NormalChatView: {
                        template: '<div data-testid="normal-chat-stub" />'
                    }
                }
            }
        });

        await flushPromises();
        await wrapper.get('[data-testid="agent-conversation-expand"]').trigger('click');

        expect(wrapper.emitted('request-workspace-switch')).toEqual([['/chat']]);
    });

    it('prefixes the conversation title with the bound node name in detail mode', async () => {
        const chatStore = useChatStore();
        chatStore.currentConversation = {
            id: 'conversation-1',
            title: 'Shared Conversation',
            boundNodeName: 'docs',
            origin: 'local',
            updatedAt: 1,
            messages: []
        };

        const wrapper = mount(AgentConversationPanel, {
            props: {
                activeAgentKey: '/docs/',
                activePath: null,
                selectedNodePath: '/docs',
                activeDocument: null,
                showAgentConversationList: true,
                contextProvider: createContextProvider(),
                restoreConversationId: 'conversation-1'
            },
            global: {
                stubs: {
                    AgentDocumentConversationList: {
                        template: '<div data-testid="agent-document-conversation-list-stub" />'
                    },
                    NormalChatView: {
                        template: '<div data-testid="normal-chat-stub" />'
                    }
                }
            }
        });

        await flushPromises();
        await wrapper.vm.$nextTick();

        expect(wrapper.get('[data-testid="agent-conversation-title"]').text()).toContain('docs - Shared Conversation');
    });

    it('restores the previous conversation detail when returning from chat mode on an agent directory', async () => {
        const chatStore = useChatStore();
        chatStore.currentConversation = {
            id: 'conversation-1',
            title: 'Shared Conversation',
            origin: 'local',
            updatedAt: 1,
            messages: []
        };

        const wrapper = mount(AgentConversationPanel, {
            props: {
                activeAgentKey: '/docs/',
                activePath: null,
                selectedNodePath: '/docs',
                activeDocument: null,
                showAgentConversationList: true,
                contextProvider: createContextProvider(),
                restoreConversationId: 'conversation-1'
            },
            global: {
                stubs: {
                    AgentDocumentConversationList: {
                        template: '<div data-testid="agent-document-conversation-list-stub" />'
                    },
                    NormalChatView: {
                        template: '<div data-testid="normal-chat-stub" />'
                    }
                }
            }
        });

        await flushPromises();
        await wrapper.vm.$nextTick();

        expect(wrapper.get('[data-testid="agent-conversation-toolbar"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="agent-conversation-title"]').text()).toContain('Shared Conversation');
        expect(wrapper.find('[data-testid="agent-document-conversation-list-stub"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="normal-chat-stub"]').exists()).toBe(true);
    });

    it('keeps the agent directory list as the default when no restore id is provided', async () => {
        const chatStore = useChatStore();
        chatStore.currentConversation = {
            id: 'conversation-1',
            title: 'Shared Conversation',
            origin: 'local',
            updatedAt: 1,
            messages: []
        };

        const wrapper = mount(AgentConversationPanel, {
            props: {
                activeAgentKey: '/docs/',
                activePath: null,
                selectedNodePath: '/docs',
                activeDocument: null,
                showAgentConversationList: true,
                contextProvider: createContextProvider()
            },
            global: {
                stubs: {
                    AgentDocumentConversationList: {
                        template: '<div data-testid="agent-document-conversation-list-stub" />'
                    },
                    NormalChatView: {
                        template: '<div data-testid="normal-chat-stub" />'
                    }
                }
            }
        });

        await flushPromises();
        await wrapper.vm.$nextTick();

        expect(wrapper.get('[data-testid="agent-document-conversation-list-stub"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="normal-chat-stub"]').exists()).toBe(false);
    });

    it('switches to the conversation detail when the restore id arrives after mount', async () => {
        const chatStore = useChatStore();
        chatStore.currentConversation = {
            id: 'conversation-1',
            title: 'Shared Conversation',
            origin: 'local',
            updatedAt: 1,
            messages: []
        };

        const wrapper = mount(AgentConversationPanel, {
            props: {
                activeAgentKey: '/docs/',
                activePath: null,
                selectedNodePath: '/docs',
                activeDocument: null,
                showAgentConversationList: true,
                contextProvider: createContextProvider(),
                restoreConversationId: null
            },
            global: {
                stubs: {
                    AgentDocumentConversationList: {
                        template: '<div data-testid="agent-document-conversation-list-stub" />'
                    },
                    NormalChatView: {
                        template: '<div data-testid="normal-chat-stub" />'
                    }
                }
            }
        });

        await flushPromises();
        await wrapper.vm.$nextTick();
        expect(wrapper.get('[data-testid="agent-document-conversation-list-stub"]').exists()).toBe(true);

        await wrapper.setProps({ restoreConversationId: 'conversation-1' });
        await flushPromises();
        await wrapper.vm.$nextTick();

        expect(wrapper.get('[data-testid="agent-conversation-toolbar"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="agent-conversation-title"]').text()).toContain('Shared Conversation');
        expect(wrapper.find('[data-testid="agent-document-conversation-list-stub"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="normal-chat-stub"]').exists()).toBe(true);
    });

    it('opens a document conversation from context provider even when local storage has not synced it yet', async () => {
        const chatStore = useChatStore();
        chatStore.setProviders(new PanelTestModelProvider(), new MissingConversationStorageProvider());
        const contextConversation: Conversation = {
            id: 'context-conversation-1',
            title: 'Remote document discussion',
            origin: 'local',
            agentKey: '/docs/',
            documentPaths: ['/docs/guide.md'],
            updatedAt: 100,
            messages: [
                {
                    id: 'message-user-1',
                    role: 'user',
                    content: '数据库中已有的用户消息'
                },
                {
                    id: 'message-assistant-1',
                    role: 'assistant',
                    content: '数据库中已有的助手回复'
                }
            ]
        };

        const wrapper = mount(AgentConversationPanel, {
            props: {
                activeAgentKey: '/docs/',
                activePath: '/docs/guide.md',
                selectedNodePath: '/docs/guide.md',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: ''
                },
                showAgentConversationList: false,
                contextProvider: createContextProvider([contextConversation])
            },
            global: {
                stubs: {
                    NormalChatView: {
                        template: '<div data-testid="normal-chat-stub" />'
                    }
                }
            }
        });

        await flushPromises();
        await wrapper.vm.$nextTick();
        await wrapper.get('[data-testid="agent-document-conversation-item"]').trigger('click');
        await flushPromises();

        expect(chatStore.currentConversation).toMatchObject({
            id: 'context-conversation-1',
            title: 'Remote document discussion',
            messages: [
                { role: 'user', content: '数据库中已有的用户消息' },
                { role: 'assistant', content: '数据库中已有的助手回复' }
            ]
        });
        expect(wrapper.get('[data-testid="agent-conversation-title"]').text()).toContain('Remote document discussion');
    });
});
