// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import type { Conversation, IContextProvider, IConversationPersistProvider, IModelProvider } from '@packages/core/src';
import { encodeTextDocument } from '@packages/core/src';
import type { ProviderConfig } from '@packages/core/config';
import AgentPane from './AgentPane.vue';
import { useChatStore } from '../store/chat';

class PaneTestProvider implements IModelProvider {
    id = 'pane-test-provider';
    acceptedMimeTypes = ['text/plain', 'text/markdown', 'application/pdf'];
    calls: Array<{ prompt: string; options: Record<string, unknown> }> = [];

    async getAvailableModels() {
        return {
            models: [{ id: 'pane-model', name: 'Pane Model' }],
            defaultModel: 'pane-model'
        };
    }

    async checkAuth(): Promise<boolean> {
        return true;
    }

    async getDocumentCapability() {
        return {
            acceptedMimeTypes: [...this.acceptedMimeTypes]
        };
    }

    async sendMessage(prompt: string, options: Record<string, unknown>, onUpdate: (update: { text: string }) => void) {
        this.calls.push({ prompt, options });
        onUpdate({ text: `reply:${prompt}` });
        return {
            text: `reply:${prompt}`,
            conversationId: 'pane-conversation',
            messageId: 'pane-message'
        };
    }

    abort(): void {}
}

class PaneTestStorageProvider implements IConversationPersistProvider {
    id = 'pane-test-storage';
    private readonly conversations: Conversation[] = [];

    async saveConversation(chat: Conversation): Promise<void> {
        const index = this.conversations.findIndex((item) => item.id === chat.id);
        if (index >= 0) {
            this.conversations[index] = chat;
            return;
        }

        this.conversations.unshift(chat);
    }

    async getConversation(id: string): Promise<Conversation | null> {
        return this.conversations.find((item) => item.id === id) || null;
    }

    async getAllConversations(): Promise<Conversation[]> {
        return [...this.conversations];
    }

    async deleteConversation(id: string): Promise<void> {
        const index = this.conversations.findIndex((item) => item.id === id);
        if (index >= 0) {
            this.conversations.splice(index, 1);
        }
    }
}

function createPaneContextProvider(conversations: Conversation[] = []): IContextProvider {
    return {
        id: 'workspace-context',
        initializeAccess: async () => undefined,
        getContext: async () => ({ nodes: [], agentConfigs: {} }),
        getConversations: vi.fn(async (query: { documentPath?: string }) => conversations.filter((conversation) => (
            query.documentPath ? conversation.documentPaths?.includes(query.documentPath) : true
        ))),
        readDocument: async (path: string) => ({ path, mimeType: 'text/markdown', dataBase64: encodeTextDocument('') }),
        writeDocument: async () => undefined,
        createNode: async () => ({ path: '/draft.md', name: 'draft.md', kind: 'file', agentKey: '/' }),
        deleteNode: async () => undefined,
        renameNode: async (input: { path: string; name: string }) => ({
            path: input.path.replace(/[^/]+$/, input.name),
            name: input.name,
            kind: 'file',
            agentKey: '/'
        }),
        searchInScope: async () => []
    };
}

const paneProviderCatalog: ProviderConfig[] = [
    {
        id: 'pane-test-provider',
        name: 'Pane Test Provider',
        models: [{ id: 'pane-model', name: 'Pane Model' }],
        defaultModel: 'pane-model',
        supportedRuntimeModes: ['web']
    }
];

describe('AgentPane', () => {
    it('renders the document conversation list with the shared toolbar for document selections', () => {
        setActivePinia(createPinia());
        const wrapper = mount(AgentPane, {
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
                    mimeType: 'text/markdown',
                    dataBase64: encodeTextDocument('# Guide')
                },
                contextProvider: createPaneContextProvider(),
                onFileChanged: null
            }
        });

        expect(wrapper.get('[data-testid="agent-pane"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="agent-document-conversation-list"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="agent-conversation-toolbar"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="agent-conversation-title"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="agent-conversation-back"]').attributes('disabled')).toBeDefined();
        expect(wrapper.get('[data-testid="agent-conversation-list-plus"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="agent-name"]').text()).toContain('Docs Agent（/docs）');
        expect(wrapper.get('[data-testid="agent-model"]').text()).toContain('gemini-api / gemini-2.5-pro');
        expect(wrapper.text()).toContain('Docs Agent（/docs）');
        expect(wrapper.text()).toContain('gemini-api / gemini-2.5-pro');
        expect(wrapper.text()).not.toContain('当前文档');
        expect(wrapper.text()).not.toContain('新建对话');
    });

    it('prefers the nearest matched agent config directory over the current scope path', () => {
        setActivePinia(createPinia());
        const wrapper = mount(AgentPane, {
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
                    mimeType: 'text/markdown',
                    dataBase64: encodeTextDocument('# Note')
                },
                contextProvider: createPaneContextProvider(),
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

        expect(wrapper.get('[data-testid="agent-name"]').text()).toContain('Archive Agent（/workspace/archive）');
        expect(wrapper.get('[data-testid="agent-name"]').text()).not.toContain('/workspace/archive/reports');
    });

    it('shows root scope for the default agent when no scoped config is matched', () => {
        setActivePinia(createPinia());
        const wrapper = mount(AgentPane, {
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
                    mimeType: 'text/markdown',
                    dataBase64: encodeTextDocument('# Welcome')
                },
                contextProvider: createPaneContextProvider(),
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

        expect(wrapper.get('[data-testid="agent-name"]').text()).toContain('Default Knowledge Agent（/）');
    });

    it('renders fallback default agent metadata when no scoped agent is available', () => {
        setActivePinia(createPinia());
        const wrapper = mount(AgentPane, {
            props: {
                activeAgent: null,
                activePath: null,
                activeDocument: null,
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

        expect(wrapper.get('[data-testid="agent-name"]').text()).toContain('Workspace Agent（/）');
        expect(wrapper.get('[data-testid="agent-model"]').text()).toContain('gemini-api / Gemini Pro Latest');
    });

    it('syncs and clears the chat agent context with the pane lifecycle', async () => {
        setActivePinia(createPinia());
        const chatStore = useChatStore();
        const wrapper = mount(AgentPane, {
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
                    mimeType: 'text/markdown',
                    dataBase64: encodeTextDocument('# Guide')
                },
                contextProvider: createPaneContextProvider(),
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
            mimeType: 'text/markdown',
            dataBase64: encodeTextDocument('# Guide')
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
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Archive Log')
            }
        });

        expect(chatStore.activeAgentContext?.name).toBe('Archive Agent');
        expect(chatStore.activeWorkspacePath).toBe('/archive/log.md');
        expect(chatStore.activeWorkspaceDocument).toEqual({
            path: '/archive/log.md',
            mimeType: 'text/markdown',
            dataBase64: encodeTextDocument('# Archive Log')
        });

        wrapper.unmount();
        expect(chatStore.activeAgentContext).toBeNull();
        expect(chatStore.activeWorkspacePath).toBeNull();
        expect(chatStore.activeWorkspaceDocument).toBeNull();
    });

    it('opens detail mode from the document conversation list and shows the outer toolbar', async () => {
        setActivePinia(createPinia());
        const chatStore = useChatStore();
        const provider = new PaneTestProvider();
        const storage = new PaneTestStorageProvider();
        await storage.saveConversation({
            id: 'conversation-1',
            title: 'Guide discussion',
            boundNodeName: 'guide.md',
            origin: 'local',
            agentKey: '/docs/',
            documentPaths: ['/docs/guide.md'],
            messages: [],
            updatedAt: 100
        });
        chatStore.setProviders(provider, storage);
        await chatStore.initializeProviderCatalog(paneProviderCatalog);

        const wrapper = mount(AgentPane, {
            props: {
                activeAgent: {
                    name: 'Docs Agent',
                    effectiveInstructions: 'Use docs context',
                    scopePath: '/docs',
                    sourcePaths: ['/docs/.agent.json']
                },
                activeAgentKey: '/docs/',
                activePath: '/docs/guide.md',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: encodeTextDocument('# Guide')
                },
                contextProvider: createPaneContextProvider([
                    {
                        id: 'conversation-1',
                        title: 'Guide discussion',
                        boundNodeName: 'guide.md',
                        origin: 'local',
                        agentKey: '/docs/',
                        documentPaths: ['/docs/guide.md'],
                        messages: [],
                        updatedAt: 100
                    }
                ]),
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

        await nextTick();
        expect(wrapper.get('[data-testid="agent-document-conversation-item"]').text()).toContain('guide.md - Guide discussion');
        expect(wrapper.get('[data-testid="agent-document-conversation-item"]').attributes('title')).toBe('guide.md - Guide discussion');
        await wrapper.get('[data-testid="agent-document-conversation-item"]').trigger('click');
        await flushPromises();

        expect(wrapper.get('[data-testid="agent-conversation-toolbar"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="agent-conversation-title"]').text()).toBe('guide.md - Guide discussion');
        expect(wrapper.get('[data-testid="normal-chat-stub"]').exists()).toBe(true);
    });

    it('shows the agent conversation list when an agent-bound directory is selected', async () => {
        setActivePinia(createPinia());
        const chatStore = useChatStore();
        const provider = new PaneTestProvider();
        const storage = new PaneTestStorageProvider();
        await storage.saveConversation({
            id: 'conversation-agent-1',
            title: 'Archive planning',
            origin: 'local',
            agentKey: '/archive/.agent.json',
            messages: [],
            updatedAt: 200
        });
        await storage.saveConversation({
            id: 'conversation-other',
            title: 'Other discussion',
            origin: 'local',
            agentKey: '/other/.agent.json',
            messages: [],
            updatedAt: 100
        });
        chatStore.setProviders(provider, storage);
        await chatStore.initializeProviderCatalog(paneProviderCatalog);
        await chatStore.loadLocalConversations();

        const wrapper = mount(AgentPane, {
            props: {
                activeAgent: {
                    name: 'Archive Agent',
                    effectiveInstructions: 'Use archive context',
                    scopePath: '/archive',
                    sourcePaths: ['/archive/.agent.json']
                },
                activeAgentKey: '/archive/.agent.json',
                activePath: '/archive',
                activeDocument: null,
                showAgentConversationList: true,
                contextProvider: createPaneContextProvider(),
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

        await nextTick();

        expect(wrapper.get('[data-testid="agent-document-conversation-list"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="agent-conversation-toolbar"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="agent-conversation-title"]').exists()).toBe(false);
        expect(wrapper.text()).toContain('Archive planning');
        expect(wrapper.text()).not.toContain('Other discussion');
        expect(wrapper.text()).not.toContain('当前文档还没有关联会话。');
    });

    it('opens detail mode from the agent conversation list and keeps the shared toolbar', async () => {
        setActivePinia(createPinia());
        const chatStore = useChatStore();
        const provider = new PaneTestProvider();
        const storage = new PaneTestStorageProvider();
        await storage.saveConversation({
            id: 'conversation-agent-1',
            title: 'Archive planning',
            origin: 'local',
            agentKey: '/archive/.agent.json',
            messages: [],
            updatedAt: 200
        });
        chatStore.setProviders(provider, storage);
        await chatStore.initializeProviderCatalog(paneProviderCatalog);
        await chatStore.loadLocalConversations();

        const wrapper = mount(AgentPane, {
            props: {
                activeAgent: {
                    name: 'Archive Agent',
                    effectiveInstructions: 'Use archive context',
                    scopePath: '/archive',
                    sourcePaths: ['/archive/.agent.json']
                },
                activeAgentKey: '/archive/.agent.json',
                activePath: '/archive',
                activeDocument: null,
                showAgentConversationList: true,
                contextProvider: createPaneContextProvider(),
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

        await nextTick();
        await wrapper.get('[data-testid="agent-document-conversation-item"]').trigger('click');
        await flushPromises();

        expect(wrapper.get('[data-testid="agent-conversation-toolbar"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="agent-conversation-title"]').text()).toBe('Archive planning');
        expect(wrapper.get('[data-testid="normal-chat-stub"]').exists()).toBe(true);
    });

    it('resets back to the agent conversation list when the selected node changes within the same agent scope', async () => {
        setActivePinia(createPinia());
        const chatStore = useChatStore();
        const provider = new PaneTestProvider();
        const storage = new PaneTestStorageProvider();
        await storage.saveConversation({
            id: 'conversation-agent-1',
            title: 'Archive planning',
            origin: 'local',
            agentKey: '/archive/.agent.json',
            messages: [],
            updatedAt: 200
        });
        chatStore.setProviders(provider, storage);
        await chatStore.initializeProviderCatalog(paneProviderCatalog);
        await chatStore.loadLocalConversations();

        const wrapper = mount(AgentPane, {
            props: {
                activeAgent: {
                    name: 'Archive Agent',
                    effectiveInstructions: 'Use archive context',
                    scopePath: '/archive',
                    sourcePaths: ['/archive/.agent.json']
                },
                activeAgentKey: '/archive/.agent.json',
                activePath: null,
                selectedNodePath: '/archive',
                activeDocument: null,
                showAgentConversationList: true,
                contextProvider: createPaneContextProvider(),
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

        await nextTick();
        await wrapper.get('[data-testid="agent-document-conversation-item"]').trigger('click');
        await flushPromises();

        expect(wrapper.get('[data-testid="agent-conversation-title"]').text()).toBe('Archive planning');

        await wrapper.setProps({
            selectedNodePath: '/archive/reports'
        });
        await flushPromises();

        expect(wrapper.find('[data-testid="agent-conversation-title"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="agent-document-conversation-list"]').exists()).toBe(true);
        expect(wrapper.text()).toContain('Archive planning');
    });

    it('routes active pdf documents into attachments after provider mime negotiation', async () => {
        setActivePinia(createPinia());
        const chatStore = useChatStore();
        const provider = new PaneTestProvider();
        chatStore.setProviders(provider, new PaneTestStorageProvider());
        await chatStore.initializeProviderCatalog(paneProviderCatalog);

        const wrapper = mount(AgentPane, {
            props: {
                activeAgent: {
                    name: 'Docs Agent',
                    effectiveInstructions: 'Use docs context',
                    scopePath: '/docs',
                    sourcePaths: ['/docs/.agent.json']
                },
                activePath: '/docs/spec.pdf',
                activeDocument: {
                    path: '/docs/spec.pdf',
                    mimeType: 'application/pdf',
                    dataBase64: 'JVBERi0xLjQ='
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

        await chatStore.sendMessage('请总结这个 PDF');

        expect(provider.calls[0]?.prompt).toBe('请总结这个 PDF');
        expect(provider.calls[0]?.options.attachments).toEqual([
            expect.objectContaining({
                id: 'active-document:/docs/spec.pdf',
                name: 'spec.pdf',
                mimeType: 'application/pdf'
            })
        ]);

        wrapper.unmount();
    });

    it('passes the restore conversation id to the conversation panel', () => {
        setActivePinia(createPinia());
        const wrapper = mount(AgentPane, {
            props: {
                activeAgent: {
                    name: 'Docs Agent',
                    effectiveInstructions: 'Use docs context',
                    modelProviderName: 'gemini-api',
                    modelName: 'gemini-2.5-flash',
                    scopePath: '/docs',
                    sourcePaths: ['/docs/.agent.json']
                },
                activeAgentKey: '/docs/',
                activePath: null,
                selectedNodePath: '/docs',
                activeDocument: null,
                showAgentConversationList: true,
                contextProvider: createPaneContextProvider(),
                onFileChanged: null,
                restoreConversationId: 'conversation-1'
            },
            global: {
                stubs: {
                    AgentConversationPanel: {
                        props: ['restoreConversationId'],
                        template: '<div data-testid="agent-conversation-panel-stub" :data-restore-conversation-id="restoreConversationId || \'\'" />'
                    },
                    NormalChatView: {
                        template: '<div data-testid="normal-chat-stub" />'
                    }
                }
            }
        });

        expect(wrapper.get('[data-testid="agent-conversation-panel-stub"]').attributes('data-restore-conversation-id')).toBe('conversation-1');
    });

    it('forwards workspace switch requests from the conversation panel', async () => {
        setActivePinia(createPinia());
        const wrapper = mount(AgentPane, {
            props: {
                activeAgent: {
                    name: 'Docs Agent',
                    effectiveInstructions: 'Use docs context',
                    modelProviderName: 'gemini-api',
                    modelName: 'gemini-2.5-flash',
                    scopePath: '/docs',
                    sourcePaths: ['/docs/.agent.json']
                },
                activeAgentKey: '/docs/',
                activePath: null,
                selectedNodePath: '/docs',
                activeDocument: null,
                showAgentConversationList: true,
                contextProvider: createPaneContextProvider(),
                onFileChanged: null
            },
            global: {
                stubs: {
                    AgentConversationPanel: {
                        template: '<button data-testid="agent-conversation-panel-stub" @click="$emit(\'request-workspace-switch\', \'/chat\')" />'
                    },
                    NormalChatView: {
                        template: '<div data-testid="normal-chat-stub" />'
                    }
                }
            }
        });

        await wrapper.get('[data-testid="agent-conversation-panel-stub"]').trigger('click');

        expect(wrapper.emitted('request-workspace-switch')).toEqual([['/chat']]);
    });
});
