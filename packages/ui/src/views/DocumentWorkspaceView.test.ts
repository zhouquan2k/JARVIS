// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
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

    it('renders the three-pane document workspace shell with the root agent editor selected', async () => {
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
                    AgentView: {
                        props: ['agentKey', 'ownerNode'],
                        template: `
                          <div
                            data-testid="agent-view-stub"
                            :data-agent-key="agentKey"
                            :data-owner-path="ownerNode.path"
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
        expect(wrapper.find('[data-testid="document-editor"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="agent-view-stub"]').attributes('data-owner-path')).toBe('/');
        expect(wrapper.get('[data-testid="agent-view-stub"]').attributes('data-agent-key')).toBe('/');
        expect(wrapper.get('[data-testid="agent-pane"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="agent-pane"]').attributes('data-agent-name')).toBe('Root Agent');
        expect(wrapper.get('.knowledge-grid').attributes('style')).toContain('100% - 8px');
        expect(wrapper.findAll('.grid-pane')).toHaveLength(3);
    });

    it('keeps AgentView visible and passes owner index document when an agent owner index exists', async () => {
        const wrapper = mount(DocumentWorkspaceView, {
            props: {
                contextProvider: createMockContextProvider({
                    nodes: [
                        { path: '/docs', name: 'docs', kind: 'directory' },
                        { path: '/docs/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/docs' },
                        { path: '/docs/index.md', name: 'index.md', kind: 'file', parentPath: '/docs' }
                    ],
                    documents: {
                        '/docs/.agent.json': JSON.stringify({
                            name: 'Docs Agent',
                            instructions: 'Handle docs.'
                        }),
                        '/docs/index.md': '# Docs index'
                    }
                })
            },
            global: {
                stubs: {
                    AgentPane: {
                        template: '<div data-testid="agent-pane" />'
                    },
                    AgentView: {
                        props: ['indexDocument'],
                        template: '<div data-testid="agent-view-stub" :data-index-path="indexDocument?.path ?? \'\'" />'
                    },
                    DocumentEditorPane: {
                        props: ['activePath', 'activeDocument'],
                        template: '<div data-testid="document-editor" :data-active-path="activePath" />'
                    }
                }
            }
        });

        await flushPromises();
        await wrapper.vm.$nextTick();
        await wrapper.get('[data-path="/docs"]').trigger('click');
        await flushPromises();

        expect(wrapper.get('[data-testid="agent-view-stub"]').attributes('data-index-path')).toBe('/docs/index.md');
        expect(wrapper.find('[data-testid="document-editor"]').exists()).toBe(false);

        const documentStore = useDocumentWorkspaceStore();
        expect(documentStore.selectedNodePath).toBe('/docs');
        expect(documentStore.activePath).toBeNull();
        expect(documentStore.agentIndexPath).toBe('/docs/index.md');
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

    it('mounts AgentView in the middle pane for the root and selected owner directories', async () => {
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
                    AgentView: {
                        props: ['indexDocument'],
                        template: '<div data-testid="agent-view-stub" :data-index-path="indexDocument?.path ?? \'\'" />'
                    },
                    DocumentEditorPane: { template: '<div data-testid="document-editor" />' }
                }
            }
        });

        await flushPromises();
        expect(wrapper.find('[data-testid="agent-view-stub"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="agent-view-stub"]').attributes('data-index-path')).toBe('');

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

    it('wires AgentView provider loading and save events to the workspace stores', async () => {
        const chatStore = useChatStore();
        chatStore.availableProviders = [
            {
                id: 'mock-provider',
                name: 'Mock Provider',
                models: [{ id: 'mock-model', name: 'Mock Model' }],
                defaultModel: 'mock-model',
                supportedRuntimeModes: ['web']
            }
        ];
        chatStore.providerModelStates = {
            'mock-provider': { loading: false, loaded: true }
        };
        const ensureSpy = vi.spyOn(chatStore, 'ensureProviderModelsLoaded');
        const contextProvider = createMockContextProvider({
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
        });

        const wrapper = mount(DocumentWorkspaceView, {
            props: {
                contextProvider
            },
            global: {
                stubs: {
                    AgentPane: {
                        template: '<div data-testid="agent-pane" />'
                    },
                    AgentView: {
                        props: ['providers', 'modelLoadStates', 'builtinTools'],
                        template: `
                          <div
                            data-testid="agent-view-editor-stub"
                            :data-provider-count="providers.length"
                            :data-provider-loaded="modelLoadStates['mock-provider']?.loaded === true"
                            :data-builtin-tool-count="builtinTools.length"
                          >
                            <button data-testid="agent-view-load-provider" @click="$emit('load-provider-models', 'mock-provider')" />
                            <button
                              data-testid="agent-view-save-config"
                              @click="$emit('save-agent-config', {
                                description: 'Updated docs description',
                                instructions: 'Updated docs prompt',
                                modelProviderName: 'mock-provider',
                                modelName: 'mock-model',
                                inheritance: 'override',
                                tools: [
                                  { id: 'read_file' },
                                  { id: 'search_in_scope' }
                                ],
                                inheritTools: false
                              })"
                            />
                          </div>
                        `
                    },
                    DocumentEditorPane: { template: '<div data-testid="document-editor" />' }
                }
            }
        });

        await flushPromises();
        await wrapper.get('[data-path="/docs"]').trigger('click');
        await flushPromises();

        expect(wrapper.get('[data-testid="agent-view-editor-stub"]').attributes('data-provider-count')).toBe('1');
        expect(wrapper.get('[data-testid="agent-view-editor-stub"]').attributes('data-provider-loaded')).toBe('true');
        expect(wrapper.get('[data-testid="agent-view-editor-stub"]').attributes('data-builtin-tool-count')).toBe(String(9));

        await wrapper.get('[data-testid="agent-view-load-provider"]').trigger('click');
        expect(ensureSpy).toHaveBeenCalledWith('mock-provider');

        await wrapper.get('[data-testid="agent-view-save-config"]').trigger('click');
        await flushPromises();

        const saved = await contextProvider.readDocument('/docs/.agent.json');
        const parsed = JSON.parse(Buffer.from(saved.dataBase64, 'base64').toString('utf8'));
        expect(parsed).toMatchObject({
            name: 'Docs Agent',
            description: 'Updated docs description',
            instructions: 'Updated docs prompt',
            modelProviderName: 'mock-provider',
            modelName: 'mock-model',
            inheritance: 'override'
        });
        expect(parsed.tools).toEqual([
            { id: 'read_file' },
            { id: 'search_in_scope' }
        ]);
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

    it('opens a linked markdown document through the workspace store', async () => {
        const wrapper = mount(DocumentWorkspaceView, {
            props: {
                contextProvider: createMockContextProvider({
                    nodes: [
                        { path: '/docs', name: 'docs', kind: 'directory' },
                        { path: '/docs/start.md', name: 'start.md', kind: 'file', parentPath: '/docs' },
                        { path: '/docs/next.md', name: 'next.md', kind: 'file', parentPath: '/docs' }
                    ],
                    documents: {
                        '/docs/start.md': '# Start',
                        '/docs/next.md': '# Next'
                    }
                })
            },
            global: {
                stubs: {
                    AgentPane: {
                        template: '<div data-testid="agent-pane" />'
                    },
                    DocumentEditorPane: {
                        template: '<button data-testid="document-editor-link" @click="$emit(\'open-document-link\', \'/docs/next.md\')" />'
                    }
                }
            }
        });

        await flushPromises();
        const documentStore = useDocumentWorkspaceStore();
        await documentStore.openNode('/docs/start.md');
        await flushPromises();

        expect(documentStore.activePath).toBe('/docs/start.md');

        await wrapper.get('[data-testid="document-editor-link"]').trigger('click');
        await flushPromises();

        expect(documentStore.selectedNodePath).toBe('/docs/next.md');
        expect(documentStore.activePath).toBe('/docs/next.md');
        expect(documentStore.nodeHistory).toEqual(['/docs/start.md', '/docs/next.md']);
        expect(documentStore.nodeHistoryIndex).toBe(1);
    });

    it('passes the active agent name into the middle document pane title area', async () => {
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
                        template: '<div data-testid="agent-pane" />'
                    },
                    DocumentEditorPane: {
                        props: ['activeAgentName'],
                        template: '<div data-testid="document-editor" :data-agent-name="activeAgentName ?? \'\'" />'
                    }
                }
            }
        });

        await flushPromises();

        const documentStore = useDocumentWorkspaceStore();
        await documentStore.openNode('/docs/guide.md');
        await flushPromises();

        expect(wrapper.get('[data-testid="document-editor"]').attributes('data-agent-name')).toBe('Docs Agent');
    });

    it('reuses the same workspace navigation when AgentView emits a markdown document link', async () => {
        const wrapper = mount(DocumentWorkspaceView, {
            props: {
                contextProvider: createMockContextProvider({
                    nodes: [
                        { path: '/docs', name: 'docs', kind: 'directory' },
                        { path: '/docs/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/docs' },
                        { path: '/docs/index.md', name: 'index.md', kind: 'file', parentPath: '/docs' },
                        { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' }
                    ],
                    documents: {
                        '/docs/.agent.json': JSON.stringify({
                            name: 'Docs Agent',
                            instructions: 'Handle docs.'
                        }),
                        '/docs/index.md': '# Docs index',
                        '/docs/guide.md': '# Guide'
                    }
                })
            },
            global: {
                stubs: {
                    AgentPane: {
                        template: '<div data-testid="agent-pane" />'
                    },
                    AgentView: {
                        template: '<button data-testid="agent-view-link" @click="$emit(\'open-document-link\', \'/docs/guide.md\')" />'
                    },
                    DocumentEditorPane: {
                        template: '<div data-testid="document-editor" />'
                    }
                }
            }
        });

        await flushPromises();
        await wrapper.get('[data-path="/docs"]').trigger('click');
        await flushPromises();

        const documentStore = useDocumentWorkspaceStore();
        expect(documentStore.selectedNodePath).toBe('/docs');
        expect(documentStore.activePath).toBeNull();

        await wrapper.get('[data-testid="agent-view-link"]').trigger('click');
        await flushPromises();

        expect(documentStore.selectedNodePath).toBe('/docs/guide.md');
        expect(documentStore.activePath).toBe('/docs/guide.md');
        expect(documentStore.nodeHistory).toEqual(['/docs', '/docs/guide.md']);
        expect(documentStore.nodeHistoryIndex).toBe(1);
    });

    it('routes markdown conversation links to the assistant pane without changing the active document', async () => {
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
                        props: ['openConversationRequest'],
                        template: '<div data-testid="agent-pane" :data-open-conversation-id="openConversationRequest?.conversationId ?? \'\'" />'
                    },
                    DocumentEditorPane: {
                        template: '<button data-testid="document-editor-conversation-link" @click="$emit(\'open-conversation-link\', { conversationId: \'conversation-1\' })" />'
                    }
                }
            }
        });

        const chatStore = useChatStore();
        chatStore.conversations = [
            {
                id: 'conversation-1',
                title: 'Guide discussion',
                origin: 'local',
                agentKey: '/docs/',
                updatedAt: 1,
                messages: []
            }
        ];

        await flushPromises();
        const documentStore = useDocumentWorkspaceStore();
        await documentStore.openNode('/docs/guide.md');
        await flushPromises();

        expect(documentStore.activePath).toBe('/docs/guide.md');
        await wrapper.get('[data-testid="document-editor-conversation-link"]').trigger('click');
        await flushPromises();

        expect(wrapper.get('[data-testid="agent-pane"]').attributes('data-open-conversation-id')).toBe('conversation-1');
        expect(documentStore.activePath).toBe('/docs/guide.md');
        expect(documentStore.selectedNodePath).toBe('/docs/guide.md');
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

    it('keeps the agent panel in list mode after switching to a different node in the same agent scope', async () => {
        const chatStore = useChatStore();
        const storage = new MockConversationStorage([
            {
                id: 'conversation-saved',
                title: 'Saved Chat',
                origin: 'local',
                agentKey: '/docs/.agent.json',
                updatedAt: 10,
                messages: []
            }
        ]);

        chatStore.setProviders(createMockModelProvider(), storage);
        await chatStore.loadLocalConversations();
        chatStore.saveAgentViewStatus({
            selectedNodePath: '/docs',
            activePath: null,
            activeConversationId: 'conversation-saved'
        });

        const wrapper = mount(DocumentWorkspaceView, {
            props: {
                contextProvider: createMockContextProvider({
                    nodes: [
                        { path: '/docs', name: 'docs', kind: 'directory' },
                        { path: '/docs/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/docs' },
                        { path: '/docs/reports', name: 'reports', kind: 'directory', parentPath: '/docs' }
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
                    NormalChatView: {
                        template: '<div data-testid="normal-chat-stub" />'
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
        expect(wrapper.get('[data-testid="agent-conversation-title"]').text()).toBe('Saved Chat');

        await wrapper.get('[data-path="/docs/reports"]').trigger('click');
        await flushPromises();

        expect(wrapper.find('[data-testid="agent-conversation-title"]').exists()).toBe(false);
        expect(wrapper.get('[data-testid="agent-document-conversation-list"]').exists()).toBe(true);
        expect(chatStore.currentConversation).toBeNull();
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

    it('forwards the middle pane toggle from the document header and resets state after switching documents', async () => {
        const wrapper = mount(DocumentWorkspaceView, {
            props: {
                contextProvider: createMockContextProvider({
                    nodes: [
                        { path: '/docs', name: 'docs', kind: 'directory' },
                        { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' },
                        { path: '/docs/reference.md', name: 'reference.md', kind: 'file', parentPath: '/docs' }
                    ],
                    documents: {
                        '/docs/guide.md': '# Guide',
                        '/docs/reference.md': '# Reference'
                    }
                })
            },
            global: {
                stubs: {
                    AgentPane: {
                        template: '<div data-testid="agent-pane" />'
                    },
                    DocumentEditorPane: {
                        props: ['middlePaneMode'],
                        template: `
                          <div data-testid="document-editor" :data-middle-pane-mode="middlePaneMode">
                            <button data-testid="document-middle-pane-toggle" @click="$emit('toggle-middle-pane-mode')" />
                            <button data-testid="document-editor-link" @click="$emit('open-document-link', '/docs/reference.md')" />
                            <div data-testid="document-editor-scroll-shell" style="overflow:auto">
                              <div data-testid="document-editor-surface" />
                            </div>
                          </div>
                        `
                    }
                }
            }
        });

        await flushPromises();
        const documentStore = useDocumentWorkspaceStore();
        expect(documentStore.middlePaneMode).toBe('default');
        expect(documentStore.middlePaneZoom).toBe(1);

        await documentStore.openNode('/docs/guide.md');
        await flushPromises();
        await wrapper.get('[data-testid="document-middle-pane-toggle"]').trigger('click');
        expect(documentStore.middlePaneMode).toBe('maximized');
        expect(documentStore.panelSizes).toEqual([20, 80, 0]);

        const editorScrollShell = wrapper.get('[data-testid="document-editor-scroll-shell"]').element as HTMLElement;
        Object.defineProperty(editorScrollShell, 'clientWidth', { value: 200, configurable: true });
        Object.defineProperty(editorScrollShell, 'clientHeight', { value: 120, configurable: true });
        editorScrollShell.scrollLeft = 40;
        editorScrollShell.scrollTop = 30;
        documentStore.setMiddlePaneZoom(1.5);
        await wrapper.vm.$nextTick();
        await wrapper.vm.$nextTick();
        expect(editorScrollShell.scrollLeft).toBe(110);
        expect(editorScrollShell.scrollTop).toBe(75);
        expect(documentStore.middlePaneZoom).toBe(1.5);

        await wrapper.get('[data-testid="document-editor-link"]').trigger('click');
        await flushPromises();
        expect(documentStore.middlePaneMode).toBe('default');
        expect(documentStore.middlePaneZoom).toBe(1);
    });

});
