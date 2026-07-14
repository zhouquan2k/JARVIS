// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import type { Conversation, IContextProvider, IConversationPersistProvider, IModelProvider, Task } from '@plugins/ai-agent/src/internal';
import { useDocumentWorkspaceStore } from '@packages/ui';
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
    const taskProvider = {
        getTasks: vi.fn(async (): Promise<Task[]> => []),
        createTask: vi.fn(async (task: Task): Promise<Task> => task),
        updateTask: vi.fn(async (task: Task): Promise<Task> => task),
        deleteTask: vi.fn(async () => undefined),
        setTaskCompleted: vi.fn(async (taskId: string, completed: boolean): Promise<Task> => ({
            id: taskId,
            title: 'Task',
            notes: '',
            completed,
            dueAt: null,
            priority: null,
            executionState: null,
            documentPath: null,
            agentKey: '/',
            createdAt: 1,
            updatedAt: 2,
            completedAt: completed ? 2 : null,
            calendarProviderId: null,
            calendarEventId: null,
            calendarSyncStatus: null,
            calendarLastSyncedAt: null,
            calendarLastSyncError: null
        }))
    };

    return {
        id: 'agent-panel-context',
        initializeAccess: vi.fn().mockResolvedValue(undefined),
        getContext: vi.fn().mockResolvedValue({ nodes: [], agentConfigs: {} }),
        getConversations: vi.fn(async (query: { documentPath?: string }) => conversations.filter((conversation) => (
            query.documentPath ? conversation.documentPaths?.includes(query.documentPath) : true
        ))),
        getTaskProvider: vi.fn(() => taskProvider),
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

    it('does not expose an in-flight conversation on an unrelated document', async () => {
        const chatStore = useChatStore();
        const inFlightConversation: Conversation = {
            id: 'conversation-a',
            title: 'Document A discussion',
            origin: 'local',
            agentKey: '/docs/',
            documentPaths: ['/docs/a.md'],
            updatedAt: 1,
            messages: []
        };
        chatStore.currentConversation = inFlightConversation;
        chatStore.conversations = [inFlightConversation];
        chatStore.isGenerating = true;

        const wrapper = mount(AgentConversationPanel, {
            props: {
                activeScopeKey: '/docs/',
                activePath: '/docs/b.md',
                selectedNodePath: '/docs/b.md',
                activeDocument: {
                    path: '/docs/b.md',
                    mimeType: 'text/markdown',
                    dataBase64: ''
                },
                showScopeConversationList: false,
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

        expect(wrapper.find('[data-testid="agent-document-conversation-item"]').exists()).toBe(false);
        expect(chatStore.currentConversation?.id).toBe('conversation-a');
        expect(chatStore.isGenerating).toBe(true);
    });

    it('toggles conversation focus layout in place instead of switching workspace', async () => {
        const chatStore = useChatStore();
        const documentStore = useDocumentWorkspaceStore();
        chatStore.currentConversation = {
            id: 'conversation-1',
            title: 'Shared Conversation',
            origin: 'local',
            agentKey: '/docs/',
            updatedAt: 1,
            messages: []
        };
        chatStore.conversations = [chatStore.currentConversation];
        chatStore.saveAgentViewStatus({
            selectedNodePath: '/docs',
            activePath: null,
            activeConversationId: 'conversation-1'
        });

        const wrapper = mount(AgentConversationPanel, {
            props: {
                activeScopeKey: '/docs/',
                activePath: null,
                selectedNodePath: '/docs',
                activeDocument: null,
                showScopeConversationList: true,
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
        expect(documentStore.conversationFocusMode).toBe(false);
        chatStore.setQuestionIndexPanelOpen(false);

        await wrapper.get('[data-testid="agent-conversation-expand"]').trigger('click');

        expect(wrapper.emitted('request-workspace-switch')).toBeUndefined();
        expect(documentStore.conversationFocusMode).toBe(true);
        expect(chatStore.isQuestionIndexPanelOpen).toBe(true);

        await wrapper.get('[data-testid="agent-conversation-expand"]').trigger('click');

        expect(documentStore.conversationFocusMode).toBe(false);
    });

    it('shows only the conversation title in detail mode', async () => {
        const chatStore = useChatStore();
        chatStore.currentConversation = {
            id: 'conversation-1',
            title: 'Shared Conversation',
            boundNodeName: 'docs',
            origin: 'local',
            updatedAt: 1,
            messages: []
        };
        chatStore.saveAgentViewStatus({
            selectedNodePath: '/docs',
            activePath: null,
            activeConversationId: 'conversation-1'
        });

        const wrapper = mount(AgentConversationPanel, {
            props: {
                activeScopeKey: '/docs/',
                activePath: null,
                selectedNodePath: '/docs',
                activeDocument: null,
                showScopeConversationList: true,
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

        expect(wrapper.get('[data-testid="agent-conversation-title"]').text()).toBe('Shared Conversation');
        expect(wrapper.find('[data-testid="agent-conversation-rename"]').exists()).toBe(false);
    });

    it('renames the current conversation from the toolbar button through the selected list item inline editor', async () => {
        const chatStore = useChatStore();
        chatStore.currentConversation = {
            id: 'conversation-1',
            title: 'Shared Conversation',
            agentKey: '/docs/',
            origin: 'local',
            updatedAt: 1,
            messages: []
        };
        chatStore.conversations = [chatStore.currentConversation];
        const renameSpy = vi.spyOn(chatStore, 'renameLocalConversation').mockResolvedValue(undefined);
        chatStore.saveAgentViewStatus({
            selectedNodePath: '/docs',
            activePath: null,
            activeConversationId: 'conversation-1'
        });

        const wrapper = mount(AgentConversationPanel, {
            props: {
                activeScopeKey: '/docs/',
                activePath: null,
                selectedNodePath: '/docs',
                activeDocument: null,
                showScopeConversationList: true,
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
        await wrapper.get('[data-testid="agent-conversation-back"]').trigger('click');
        expect(wrapper.get('[data-testid="agent-conversation-rename"]').exists()).toBe(true);
        await wrapper.get('[data-testid="agent-conversation-rename"]').trigger('click');
        await wrapper.get('[data-testid="agent-document-conversation-rename-input"]').setValue('新标题');
        await wrapper.get('[data-testid="agent-document-conversation-rename-confirm"]').trigger('click');

        expect(renameSpy).toHaveBeenCalledWith('conversation-1', '新标题');
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
        chatStore.saveAgentViewStatus({
            selectedNodePath: '/docs',
            activePath: null,
            activeConversationId: 'conversation-1'
        });

        const wrapper = mount(AgentConversationPanel, {
            props: {
                activeScopeKey: '/docs/',
                activePath: null,
                selectedNodePath: '/docs',
                activeDocument: null,
                showScopeConversationList: true,
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
                activeScopeKey: '/docs/',
                activePath: null,
                selectedNodePath: '/docs',
                activeDocument: null,
                showScopeConversationList: true,
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
                activeScopeKey: '/docs/',
                activePath: null,
                selectedNodePath: '/docs',
                activeDocument: null,
                showScopeConversationList: true,
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

        chatStore.saveAgentViewStatus({
            selectedNodePath: '/docs',
            activePath: null,
            activeConversationId: 'conversation-1'
        });
        await wrapper.setProps({ selectedNodePath: '/docs/subdir' });
        await wrapper.setProps({ selectedNodePath: '/docs' });
        await flushPromises();
        await wrapper.vm.$nextTick();

        expect(wrapper.get('[data-testid="agent-conversation-toolbar"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="agent-conversation-title"]').text()).toContain('Shared Conversation');
        expect(wrapper.find('[data-testid="agent-document-conversation-list-stub"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="normal-chat-stub"]').exists()).toBe(true);
    });

    it('opens a requested scoped conversation in detail mode from list mode', async () => {
        const chatStore = useChatStore();
        chatStore.conversations = [
            {
                id: 'conversation-1',
                title: 'Shared Conversation',
                origin: 'local',
                agentKey: '/docs/',
                updatedAt: 1,
                messages: []
            }
        ];

        const wrapper = mount(AgentConversationPanel, {
            props: {
                activeScopeKey: '/docs/',
                activePath: null,
                selectedNodePath: '/docs',
                activeDocument: null,
                showScopeConversationList: true,
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
        expect(wrapper.get('[data-testid="agent-document-conversation-list-stub"]').exists()).toBe(true);

        await wrapper.setProps({
            openConversationRequest: {
                conversationId: 'conversation-1',
                nonce: 1
            }
        });
        await flushPromises();

        expect(chatStore.currentConversation?.id).toBe('conversation-1');
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
                activeScopeKey: '/docs/',
                activePath: '/docs/guide.md',
                selectedNodePath: '/docs/guide.md',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: ''
                },
                showScopeConversationList: false,
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
                activeScopeKey: '/docs/.agent.json',
                activePath: '/docs/guide.md',
                selectedNodePath: '/docs/guide.md',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: ''
                },
                showScopeConversationList: false,
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
            boundNodeName: 'guide',
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
                activeScopeKey: '/docs/',
                activePath: '/docs/guide.md',
                selectedNodePath: '/docs',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: ''
                },
                showScopeConversationList: false,
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
                activeScopeKey: '/docs/',
                activePath: '/docs/guide.md',
                selectedNodePath: '/docs',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: ''
                },
                showScopeConversationList: false,
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
                activeScopeKey: '/docs/',
                activePath: '/docs/guide.md',
                selectedNodePath: '/docs',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: ''
                },
                showScopeConversationList: false,
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
                activeScopeKey: '/docs/',
                activePath: '/docs/guide.md',
                selectedNodePath: '/docs/guide.md',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: ''
                },
                showScopeConversationList: false,
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
                activeScopeKey: '/docs/',
                activePath: '/docs/guide.md',
                selectedNodePath: '/docs/guide.md',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: ''
                },
                showScopeConversationList: false,
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
