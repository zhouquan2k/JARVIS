// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { computed, ref } from 'vue';
import type { Conversation, IConversationPersistProvider, IModelProvider, ResolvedAgentConfig } from '@plugins/ai-agent/api';
import { createMockContextProvider } from '@plugins/ai-agent/src/testing';
import { contributionQueryKey, workspaceRuntimeContextKey } from '../plugins/injectionKeys';
import DocumentWorkspaceView from './DocumentWorkspaceView.vue';
import { useDocumentWorkspaceStore } from '../store/documentWorkspace';
import type { WorkspaceRuntimeContext } from '@packages/core/src';
import { resetMockChatStore, useMockChatStore } from '../../test-support/mockChatStore';

const agentConversationPanelStub = {
    props: ['showAgentConversationList'],
    setup(props: { showAgentConversationList?: boolean }) {
        const chatStore = useMockChatStore();
        const currentConversationTitle = computed(() => chatStore.currentConversation?.title ?? '');
        return {
            props,
            currentConversationTitle
        };
    },
    template: `
      <div>
        <div v-if="currentConversationTitle" data-testid="agent-conversation-title">{{ currentConversationTitle }}</div>
        <div v-else-if="props.showAgentConversationList" data-testid="agent-document-conversation-list" />
        <div v-else data-testid="agent-conversation-panel-stub" />
      </div>
    `
};

const workspaceAgentConfigPanelStub = {
    emits: ['open-document-link', 'open-conversation-link'],
    setup(_: unknown, { emit }: { emit: (event: 'open-document-link' | 'open-conversation-link', payload: unknown) => void }) {
        const documentStore = useDocumentWorkspaceStore();
        const chatStore = useMockChatStore();
        const selectedOwnerNode = computed(() => {
            if (documentStore.selectedNodePath === '/' && documentStore.activeAgent) {
                return {
                    path: '/',
                    name: 'Root',
                    kind: 'directory',
                    scopeKey: documentStore.activeAgentKey ?? '/',
                    ownsMetadata: true
                };
            }

            const activeNode = documentStore.activeNode;
            return activeNode?.kind === 'directory' && activeNode.ownsMetadata ? activeNode : null;
        });

        const builtinTools = computed(() => Array.from({ length: 9 }, (_, index) => ({ id: `builtin-${index + 1}` })));

        async function saveSelectedAgentConfig(patch: {
            description?: string;
            instructions?: string;
            modelProviderName?: string;
            modelName?: string;
            inheritance?: string;
            tools?: Array<{ id: string; description?: string }>;
            inheritTools?: boolean;
        }): Promise<void> {
            if (!selectedOwnerNode.value) {
                return;
            }

            await documentStore.saveAgentConfig({
                ownerPath: selectedOwnerNode.value.path,
                patch
            });
        }

        return {
            chatStore,
            documentStore,
            selectedOwnerNode,
            builtinTools,
            emit,
            saveSelectedAgentConfig
        };
    },
    template: `
      <AgentView
        v-if="selectedOwnerNode && documentStore.activeAgent && documentStore.activeAgentKey"
        :agent-key="documentStore.activeAgentKey"
        :agent="documentStore.activeAgent"
        :owner-node="selectedOwnerNode"
        :index-path="documentStore.agentIndexPath"
        :index-document="documentStore.agentIndexDocument"
        :index-draft-content="documentStore.agentIndexDraftContent"
        :index-viewer-id="documentStore.agentIndexViewerId"
        :index-pane-mode="documentStore.agentIndexPaneMode"
        :index-is-saving="documentStore.agentIndexIsSaving"
        :index-is-dirty="!!(documentStore.agentIndexPath && documentStore.dirtyPaths[documentStore.agentIndexPath])"
        :providers="chatStore.availableProviders"
        :builtin-tools="builtinTools"
        :model-load-states="chatStore.providerModelStates"
        @load-provider-models="chatStore.ensureProviderModelsLoaded"
        @save-agent-config="saveSelectedAgentConfig"
        @update-index-content="documentStore.updateAgentIndexDocument"
        @save-index-document="documentStore.flushAgentIndexDocument"
        @open-document-link="emit('open-document-link', $event)"
        @open-conversation-link="emit('open-conversation-link', $event)"
      />
    `
};

const agentTaskPanelStub = {
    template: '<div data-testid="agent-task-panel-stub" />'
};

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

function createDocumentWorkspaceContributionQuery(workspaceSelectionComponent?: Record<string, unknown>) {
    return {
        getGlobalViews: () => [],
        getRightPanelTabs: () => [
            {
                id: 'tasks',
                title: 'Tasks',
                titleKey: 'shared.taskTab',
                component: agentTaskPanelStub,
                defaultActive: true
            },
            {
                id: 'conversations',
                title: 'Conversations',
                titleKey: 'shared.conversationTab',
                component: agentConversationPanelStub
            }
        ],
        getWorkspaceSelectionViews: () => workspaceSelectionComponent
            ? [{
                id: 'test-workspace-selection-view',
                component: workspaceSelectionComponent,
                matches: (input: {
                    selectedOwnerNode?: unknown;
                    activeScopeMetadata?: unknown;
                    activeScopeKey?: unknown;
                    activePath?: string | null;
                }) => !!input.selectedOwnerNode && !!input.activeScopeMetadata && !!input.activeScopeKey && !input.activePath
            }]
            : [],
        getInsertLinkTypes: () => [],
        getDocumentCreationFlows: () => []
    };
}

function mountDocumentWorkspace(options: Parameters<typeof mount<typeof DocumentWorkspaceView>>[1]) {
    const chatStore = useMockChatStore();
    const runtimeContext: WorkspaceRuntimeContext = {
        get currentError() {
            return chatStore.currentError;
        },
        clearCurrentError() {
            chatStore.clearCurrentError();
        },
        async beforeRouteNavigate() {},
        async publishWorkspaceSelectionChanged(input) {
            chatStore.setWorkspaceContext(input);
            if (input.activeScopeMetadata !== undefined) {
                chatStore.saveWorkspaceAgentContext((input.activeScopeMetadata?.data ?? null) as ResolvedAgentConfig | null);
            }

            const savedStatus = chatStore.restoreAgentViewStatus();
            const sameSelection = savedStatus
                && (
                    savedStatus.activePath
                        ? input.activePath === savedStatus.activePath
                        : (input.selectedNodePath ?? null) === savedStatus.selectedNodePath
                );

            if (sameSelection) {
                if (!savedStatus.activeConversationId) {
                    if (chatStore.currentConversation) {
                        chatStore.clearWorkspaceConversationSelection();
                    }
                    return;
                }

                if (chatStore.currentConversation?.id !== savedStatus.activeConversationId) {
                    try {
                        await chatStore.selectLocalConversation(savedStatus.activeConversationId);
                    } catch {
                        chatStore.clearWorkspaceConversationSelection();
                    }
                }
                return;
            }

            if (chatStore.currentConversation) {
                chatStore.clearWorkspaceConversationSelection();
            }
        },
        registerCurrentErrorSource() {
            return () => undefined;
        },
        registerBeforeRouteNavigateHandler() {
            return () => undefined;
        },
        registerWorkspaceSelectionChangedHandler() {
            return () => undefined;
        },
        getPluginMessages() {
            return [];
        },
        subscribePluginMessages() {
            return () => undefined;
        },
        postPluginMessage() {
            return undefined;
        },
        postHostEvent() {
            return undefined;
        },
        subscribeHostEvent() {
            return () => undefined;
        }
    };
    const runtimeContextRef = ref<WorkspaceRuntimeContext | null>(runtimeContext);

    return mount(DocumentWorkspaceView, {
        ...options,
        global: {
            ...options?.global,
            provide: {
                [contributionQueryKey as symbol]: ref(createDocumentWorkspaceContributionQuery()),
                [workspaceRuntimeContextKey as symbol]: runtimeContextRef,
                ...(options?.global?.provide ?? {})
            },
            stubs: {
                AgentView: {
                    template: '<div data-testid="agent-view-default-stub" />'
                },
                ...(options?.global?.stubs ?? {})
            }
        }
    });
}

describe('DocumentWorkspaceView', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        resetMockChatStore();
    });

    it('renders the three-pane document workspace shell with the root agent editor selected', async () => {
        const wrapper = mountDocumentWorkspace({
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
                provide: {
                    [contributionQueryKey as symbol]: ref(createDocumentWorkspaceContributionQuery(workspaceAgentConfigPanelStub))
                },
                stubs: {
                    WorkspaceRightPane: {
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
        const wrapper = mountDocumentWorkspace({
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
                provide: {
                    [contributionQueryKey as symbol]: ref(createDocumentWorkspaceContributionQuery(workspaceAgentConfigPanelStub))
                },
                stubs: {
                    WorkspaceRightPane: {
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
        const wrapper = mountDocumentWorkspace({
            props: {
                contextProvider: createMockContextProvider()
            },
            global: {
                stubs: {
                    WorkspaceRightPane: {
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
        const wrapper = mountDocumentWorkspace({
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
                provide: {
                    [contributionQueryKey as symbol]: ref(createDocumentWorkspaceContributionQuery(workspaceAgentConfigPanelStub))
                },
                stubs: {
                    WorkspaceRightPane: { template: '<div data-testid="agent-pane" />' },
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

    it('renders a normal directory index.md in DocumentEditorPane when no AgentView matches', async () => {
        const wrapper = mountDocumentWorkspace({
            props: {
                contextProvider: createMockContextProvider({
                    nodes: [
                        { path: '/notes', name: 'notes', kind: 'directory' },
                        { path: '/notes/index.md', name: 'index.md', kind: 'file', parentPath: '/notes' }
                    ],
                    documents: {
                        '/notes/index.md': '# Notes index'
                    }
                })
            },
            global: {
                stubs: {
                    WorkspaceRightPane: { template: '<div data-testid="agent-pane" />' },
                    DocumentEditorPane: {
                        props: ['activePath', 'activeDocument', 'modelValue'],
                        template: `
                          <div
                            data-testid="document-editor"
                            :data-active-path="activePath ?? ''"
                            :data-document-path="activeDocument?.path ?? ''"
                            :data-model-value="modelValue"
                          />
                        `
                    }
                }
            }
        });

        await flushPromises();
        await wrapper.get('[data-path="/notes"]').trigger('click');
        await flushPromises();

        expect(wrapper.get('[data-testid="document-editor"]').attributes('data-active-path')).toBe('/notes/index.md');
        expect(wrapper.get('[data-testid="document-editor"]').attributes('data-document-path')).toBe('/notes/index.md');
        expect(wrapper.get('[data-testid="document-editor"]').attributes('data-model-value')).toBe('# Notes index');

        const documentStore = useDocumentWorkspaceStore();
        expect(documentStore.selectedNodePath).toBe('/notes');
        expect(documentStore.activePath).toBeNull();
        expect(documentStore.agentIndexPath).toBe('/notes/index.md');
    });

    it('routes normal directory index editing and saving through the agentIndex state', async () => {
        const contextProvider = createMockContextProvider({
            nodes: [
                { path: '/notes', name: 'notes', kind: 'directory' },
                { path: '/notes/index.md', name: 'index.md', kind: 'file', parentPath: '/notes' }
            ],
            documents: {
                '/notes/index.md': '# Notes index'
            }
        });
        const wrapper = mountDocumentWorkspace({
            props: {
                contextProvider
            },
            global: {
                stubs: {
                    WorkspaceRightPane: { template: '<div data-testid="agent-pane" />' },
                    DocumentEditorPane: {
                        template: `
                          <div data-testid="document-editor">
                            <button data-testid="document-editor-update" @click="$emit('update:model-value', '# Updated notes index')" />
                            <button data-testid="document-editor-save" @click="$emit('save')" />
                          </div>
                        `
                    }
                }
            }
        });

        await flushPromises();
        await wrapper.get('[data-path="/notes"]').trigger('click');
        await flushPromises();

        await wrapper.get('[data-testid="document-editor-update"]').trigger('click');
        await flushPromises();

        const documentStore = useDocumentWorkspaceStore();
        expect(documentStore.agentIndexDraftContent).toBe('# Updated notes index');
        expect(documentStore.dirtyPaths['/notes/index.md']).toBe(true);
        expect(documentStore.activePath).toBeNull();

        await wrapper.get('[data-testid="document-editor-save"]').trigger('click');
        await flushPromises();

        const saved = await contextProvider.readDocument('/notes/index.md');
        expect(Buffer.from(saved.dataBase64, 'base64').toString('utf8')).toBe('# Updated notes index');
        expect(documentStore.dirtyPaths['/notes/index.md']).toBe(false);
    });

    it('tells the assistant pane to show the agent conversation list for selected owner directories', async () => {
        const wrapper = mountDocumentWorkspace({
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
                provide: {
                    [contributionQueryKey as symbol]: ref(createDocumentWorkspaceContributionQuery(workspaceAgentConfigPanelStub))
                },
                stubs: {
                    WorkspaceRightPane: {
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

    it('publishes the current workspace selection after runtimeContext becomes available', async () => {
        const selectionEvents: Array<{
            activeAgentKey: string | null;
            activePath: string | null;
            activeDocumentPath: string | null;
            activeDocumentMimeType: string | null;
        }> = [];
        const runtimeContextRef = ref<WorkspaceRuntimeContext | null>(null);
        const wrapper = mountDocumentWorkspace({
            props: {
                contextProvider: createMockContextProvider({
                    nodes: [
                        { path: '/report.pdf', name: 'report.pdf', kind: 'file' }
                    ],
                    documents: {
                        '/report.pdf': {
                            path: '/report.pdf',
                            mimeType: 'application/pdf',
                            dataBase64: 'JVBERg=='
                        }
                    }
                })
            },
            global: {
                provide: {
                    [workspaceRuntimeContextKey as symbol]: runtimeContextRef
                },
                stubs: {
                    WorkspaceRightPane: { template: '<div data-testid="agent-pane" />' },
                    DocumentEditorPane: { template: '<div data-testid="document-editor" />' }
                }
            }
        });

        await flushPromises();
        await wrapper.get('[data-path="/report.pdf"]').trigger('click');
        await flushPromises();

        runtimeContextRef.value = {
            currentError: null,
            clearCurrentError: vi.fn(),
            beforeRouteNavigate: vi.fn(),
            publishWorkspaceSelectionChanged: vi.fn(async (input) => {
                selectionEvents.push({
                    activeAgentKey: input.activeScopeKey ?? null,
                    activePath: input.activePath,
                    activeDocumentPath: input.activeDocument?.path ?? null,
                    activeDocumentMimeType: input.activeDocument?.mimeType ?? null
                });
            }),
            registerCurrentErrorSource: vi.fn(() => () => undefined),
            registerBeforeRouteNavigateHandler: vi.fn(() => () => undefined),
            registerWorkspaceSelectionChangedHandler: vi.fn(() => () => undefined),
            getPluginMessages: vi.fn(() => []),
            subscribePluginMessages: vi.fn(() => () => undefined),
            postPluginMessage: vi.fn(),
            postHostEvent: vi.fn(),
            subscribeHostEvent: vi.fn(() => () => undefined)
        };
        await flushPromises();

        expect(selectionEvents).toContainEqual({
            activeAgentKey: '/',
            activePath: '/report.pdf',
            activeDocumentPath: '/report.pdf',
            activeDocumentMimeType: 'application/pdf'
        });
    });

    it('refreshes insert-link conversation options when contribution refresh keys change without changing selection', async () => {
        const conversationEntries = ref<Array<{ id: string; title: string; markdown: string }>>([]);
        const contributionQuery = {
            ...createDocumentWorkspaceContributionQuery(),
            getInsertLinkTypes: () => [{
                id: 'conversation',
                title: 'Conversations',
                supports: (input: { activePath?: string | null; activeScopeKey?: string | null }) => {
                    return !!input.activePath && !!input.activeScopeKey;
                },
                getRefreshKey: () => conversationEntries.value.map((item) => `${item.id}:${item.title}`),
                getItems: () => conversationEntries.value
            }]
        };
        const wrapper = mountDocumentWorkspace({
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
                provide: {
                    [contributionQueryKey as symbol]: ref(contributionQuery)
                },
                stubs: {
                    WorkspaceRightPane: { template: '<div data-testid="agent-pane" />' },
                    DocumentEditorPane: {
                        props: ['insertLinkTypes'],
                        template: `
                          <div data-testid="document-editor">
                            <div data-testid="conversation-link-count">{{ insertLinkTypes[0]?.items.length ?? 0 }}</div>
                            <div data-testid="conversation-link-title">{{ insertLinkTypes[0]?.items[0]?.title ?? '' }}</div>
                          </div>
                        `
                    }
                }
            }
        });

        await flushPromises();
        const documentStore = useDocumentWorkspaceStore();
        await documentStore.openNode('/docs/guide.md');
        await flushPromises();

        expect(wrapper.get('[data-testid="conversation-link-count"]').text()).toBe('0');

        conversationEntries.value = [{
            id: 'conversation-1',
            title: 'Docs Chat',
            markdown: '[Docs Chat](chatprism://conversation/conversation-1)'
        }];
        await flushPromises();

        expect(wrapper.get('[data-testid="conversation-link-count"]').text()).toBe('1');
        expect(wrapper.get('[data-testid="conversation-link-title"]').text()).toBe('Docs Chat');
    });

    it('wires AgentView provider loading and save events to the workspace stores', async () => {
        const chatStore = useMockChatStore();
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

        const wrapper = mountDocumentWorkspace({
            props: {
                contextProvider
            },
            global: {
                provide: {
                    [contributionQueryKey as symbol]: ref(createDocumentWorkspaceContributionQuery(workspaceAgentConfigPanelStub))
                },
                stubs: {
                    WorkspaceRightPane: {
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
        const wrapper = mountDocumentWorkspace({
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
                    WorkspaceRightPane: {
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
        const wrapper = mountDocumentWorkspace({
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
                    WorkspaceRightPane: {
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
        const wrapper = mountDocumentWorkspace({
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
                    WorkspaceRightPane: {
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
        const wrapper = mountDocumentWorkspace({
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
                provide: {
                    [contributionQueryKey as symbol]: ref(createDocumentWorkspaceContributionQuery(workspaceAgentConfigPanelStub))
                },
                stubs: {
                    WorkspaceRightPane: {
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
        const wrapper = mountDocumentWorkspace({
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
                    WorkspaceRightPane: {
                        props: ['openConversationRequest'],
                        template: '<div data-testid="agent-pane" :data-open-conversation-id="openConversationRequest?.conversationId ?? \'\'" />'
                    },
                    DocumentEditorPane: {
                        template: '<button data-testid="document-editor-conversation-link" @click="$emit(\'open-conversation-link\', { conversationId: \'conversation-1\' })" />'
                    }
                }
            }
        });

        const chatStore = useMockChatStore();
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
        const chatStore = useMockChatStore();
        const contextProvider = createMockContextProvider({
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
        });
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
        const firstMount = mountDocumentWorkspace({
            props: {
                contextProvider
            },
            global: {
                stubs: {
                    WorkspaceRightPane: {
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
        const documentStore = useDocumentWorkspaceStore();
        await documentStore.restoreSelection({
            selectedNodePath: '/docs',
            activePath: '/docs/guide.md'
        });
        chatStore.saveAgentViewStatus({
            selectedNodePath: '/docs',
            activePath: '/docs/guide.md',
            activeConversationId: 'conversation-saved'
        });
        firstMount.unmount();

        const wrapper = mountDocumentWorkspace({
            props: {
                contextProvider
            },
            global: {
                stubs: {
                    WorkspaceRightPane: {
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
        const chatStore = useMockChatStore();
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

        const wrapper = mountDocumentWorkspace({
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
        const documentStore = useDocumentWorkspaceStore();
        await documentStore.openNode('/docs');
        documentStore.expandedPaths = ['/', '/docs'];
        await flushPromises();
        await wrapper.get('[data-testid="workspace-right-pane-tab-conversations"]').trigger('click');

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

        const wrapper = mountDocumentWorkspace({
            props: {
                contextProvider
            },
            global: {
                stubs: {
                    WorkspaceRightPane: {
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
        const wrapper = mountDocumentWorkspace({
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
                    WorkspaceRightPane: {
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
