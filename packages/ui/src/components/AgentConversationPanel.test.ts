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
        getProjectDocuments: vi.fn(async () => [
            { path: '/docs/guide.md', name: 'guide.md' },
            { path: '/docs/reference.md', name: 'reference.md' }
        ]),
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

        expect(wrapper.get('[data-testid="agent-conversation-title"]').text()).toBe('docs - Shared Conversation');
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
        expect(wrapper.get('[data-testid="agent-conversation-tools"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="agent-conversation-title"]').text()).toBe('Shared Conversation');
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
        expect(wrapper.find('[data-testid="agent-conversation-title"]').exists()).toBe(false);
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

    it('creates a new document conversation with immediate agent and document bindings', async () => {
        const chatStore = useChatStore();
        chatStore.setProviders(new PanelTestModelProvider(), new MissingConversationStorageProvider());
        chatStore.setWorkspaceMode('agent');

        const wrapper = mount(AgentConversationPanel, {
            props: {
                activeAgentKey: '/docs/.agent.json',
                activePath: '/docs/guide.md',
                selectedNodePath: '/docs/guide.md',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: ''
                },
                showAgentConversationList: false,
                contextProvider: createContextProvider()
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
        await wrapper.get('[data-testid="agent-conversation-list-plus"]').trigger('click');

        expect(chatStore.currentConversation).toMatchObject({
            title: 'New Chat',
            boundNodeName: 'guide.md',
            agentKey: '/docs/',
            documentPaths: ['/docs/guide.md']
        });
    });

    it('rebinds the current conversation document from the project document picker', async () => {
        const chatStore = useChatStore();
        chatStore.setProviders(new PanelTestModelProvider(), new MissingConversationStorageProvider());
        chatStore.currentConversation = {
            id: 'conversation-1',
            title: 'Shared Conversation',
            origin: 'local',
            agentKey: '/docs/',
            documentPaths: ['/docs/guide.md', '/docs/appendix.md'],
            updatedAt: 1,
            messages: []
        };
        const bindSpy = vi.spyOn(chatStore, 'bindConversationToDocument').mockResolvedValue(undefined);

        const wrapper = mount(AgentConversationPanel, {
            props: {
                activeAgentKey: '/docs/',
                activePath: '/docs/guide.md',
                selectedNodePath: '/docs',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: ''
                },
                showAgentConversationList: false,
                contextProvider: createContextProvider()
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
        await wrapper.get('[data-testid="agent-conversation-rebind-document"]').trigger('click');
        await flushPromises();

        expect(wrapper.get('[data-testid="agent-conversation-document-picker"]').exists()).toBe(true);
        await wrapper.get('[data-testid="agent-conversation-document-option-reference.md"]').trigger('click');

        expect(bindSpy).toHaveBeenCalledWith('conversation-1', {
            documentPath: '/docs/reference.md',
            previousDocumentPath: '/docs/guide.md'
        });
    });

    it('allows imported conversations to rebind their document from the project document picker', async () => {
        const chatStore = useChatStore();
        chatStore.setProviders(new PanelTestModelProvider(), new MissingConversationStorageProvider());
        chatStore.currentConversation = {
            id: 'conversation-1',
            title: 'Imported Conversation',
            origin: 'gemini-web',
            agentKey: '/docs/',
            documentPaths: ['/docs/guide.md'],
            updatedAt: 1,
            messages: []
        };
        const bindSpy = vi.spyOn(chatStore, 'bindConversationToDocument').mockResolvedValue(undefined);

        const wrapper = mount(AgentConversationPanel, {
            props: {
                activeAgentKey: '/docs/',
                activePath: '/docs/guide.md',
                selectedNodePath: '/docs',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: ''
                },
                showAgentConversationList: false,
                contextProvider: createContextProvider()
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
        expect(wrapper.get('[data-testid="agent-conversation-rebind-document"]').attributes('disabled')).toBeUndefined();

        await wrapper.get('[data-testid="agent-conversation-rebind-document"]').trigger('click');
        await flushPromises();

        expect(wrapper.get('[data-testid="agent-conversation-document-picker"]').exists()).toBe(true);
        await wrapper.get('[data-testid="agent-conversation-document-option-reference.md"]').trigger('click');

        expect(bindSpy).toHaveBeenCalledWith('conversation-1', {
            documentPath: '/docs/reference.md',
            previousDocumentPath: '/docs/guide.md'
        });
    });

    it('hides the rebind and archive actions when there is no current conversation', async () => {
        const chatStore = useChatStore();
        chatStore.currentConversation = null;

        const wrapper = mount(AgentConversationPanel, {
            props: {
                activeAgentKey: '/docs/',
                activePath: '/docs/guide.md',
                selectedNodePath: '/docs',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: ''
                },
                showAgentConversationList: false,
                contextProvider: createContextProvider()
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

        expect(wrapper.find('[data-testid="agent-conversation-rebind-document"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="agent-conversation-archive"]').exists()).toBe(false);
    });

    it('highlights the archive action when the current conversation is not archived yet', async () => {
        const chatStore = useChatStore();
        chatStore.currentConversation = {
            id: 'conversation-1',
            title: 'Shared Conversation',
            origin: 'local',
            updatedAt: 1,
            messages: [{ id: 'user-1', role: 'user', content: 'Archive this' }]
        };
        chatStore.currentConversationArchiveStatus = {
            state: 'idle',
            archivedAt: null,
            documentPath: null,
            sourceMessageCount: null
        };
        chatStore.canArchiveCurrentConversation = vi.fn(() => true);
        chatStore.archiveCurrentConversationToDocument = vi.fn().mockResolvedValue(undefined);

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
                contextProvider: createContextProvider()
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

        const archiveButton = wrapper.get('[data-testid="agent-conversation-archive"]');
        expect(archiveButton.classes()).toContain('agent-conversation-panel__icon-btn--highlighted');
        expect(archiveButton.attributes('disabled')).toBeUndefined();

        await archiveButton.trigger('click');
        expect(chatStore.archiveCurrentConversationToDocument).toHaveBeenCalledTimes(1);
    });

    it('disables the archive action when the current conversation is already archived', async () => {
        const chatStore = useChatStore();
        chatStore.currentConversation = {
            id: 'conversation-1',
            title: 'Shared Conversation',
            origin: 'local',
            updatedAt: 1,
            messages: [{ id: 'user-1', role: 'user', content: 'Archive this' }]
        };
        chatStore.currentConversationArchiveStatus = {
            state: 'archived',
            archivedAt: 123,
            documentPath: '/docs/guide.md',
            sourceMessageCount: 1
        };
        chatStore.canArchiveCurrentConversation = vi.fn(() => true);
        chatStore.archiveCurrentConversationToDocument = vi.fn().mockResolvedValue(undefined);

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
                contextProvider: createContextProvider()
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

        const archiveButton = wrapper.get('[data-testid="agent-conversation-archive"]');
        expect(archiveButton.attributes('disabled')).toBeDefined();
        expect(archiveButton.classes()).not.toContain('agent-conversation-panel__icon-btn--highlighted');
        await archiveButton.trigger('click');
        expect(chatStore.archiveCurrentConversationToDocument).toHaveBeenCalledTimes(0);
    });
});
