// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const mockProvider = {
        id: 'mock-provider',
        sendMessage: vi.fn(async () => ({
            text: 'mock response',
            conversationId: 'conversation-1',
            messageId: 'message-1'
        })),
        abort: vi.fn()
    };

    const chatStore = {
        currentError: null as string | null,
        currentConversation: null as any,
        conversations: [] as any[],
        getConversationsByAgent: vi.fn(() => []),
        setProviderCatalog: vi.fn(),
        setHistoryProviders: vi.fn(),
        setAgentRuntime: vi.fn(),
        setRuntimeMode: vi.fn(),
        setModelProviderResolver: vi.fn(),
        setProviderModelsResolver: vi.fn(),
        setProviders: vi.fn(),
        setExternalFileImportHandler: vi.fn(),
        initializeProviderCatalog: vi.fn(async () => undefined),
        init: vi.fn(async () => undefined),
        resolveSendTarget: vi.fn(async () => ({
            provider: mockProvider,
            modelId: 'mock-model',
            modelOptions: { deepThink: true },
            reasoningEffort: 'high'
        }))
    };

    const getConversations = vi.fn(async () => [] as any[]);

    const compareStore = {
        analysisError: null as string | null,
        setRuntime: vi.fn(async () => undefined)
    };

    const runtime = {
        getProviderCatalog: vi.fn(() => [{
            id: 'mock-provider',
            name: 'Mock Provider',
            models: [{ id: 'mock-model', name: 'Mock Model' }],
            defaultModel: 'mock-model'
        }]),
        getProvider: vi.fn(() => mockProvider),
        getProviderModels: vi.fn(async () => ({
            models: [{ id: 'mock-model', name: 'Mock Model' }],
            defaultModel: 'mock-model'
        }))
    };

    return {
        mockProvider,
        chatStore,
        getConversations,
        compareStore,
        runtime
    };
});

vi.mock('../../store/chat', () => ({
    useChatStore: () => mocks.chatStore
}));

vi.mock('../../store/compare', () => ({
    useCompareStore: () => mocks.compareStore
}));

vi.mock('../../testing/createMockRuntime', () => ({
    createMockRuntime: vi.fn(() => mocks.runtime)
}));

vi.mock('../../testing/createMockSyncTransport', () => ({
    createMockSyncTransport: vi.fn(() => ({}))
}));

vi.mock('../../providers/storage/IndexedDBStorageProvider', () => ({
    IndexedDBStorageProvider: class IndexedDBStorageProvider {}
}));

vi.mock('../../providers/storage/SyncStorageProvider', () => ({
    SyncStorageProvider: class SyncStorageProvider {
        async hydrate() {
            return undefined;
        }
    }
}));

vi.mock('../../testing/createMockHistoryProvider', () => ({
    createMockHistoryProvider: vi.fn((providerId: string) => ({
        id: providerId,
        async getHistoryList() {
            return [];
        },
        async getHistoryDetail() {
            return null;
        }
    }))
}));

vi.mock('../../runtime/agents/runtime/createAgentRuntime', () => ({
    createAgentRuntime: vi.fn(() => ({}))
}));

vi.mock('./hostBridge', () => ({
    initializeAiAgentHostBridge: vi.fn()
}));

vi.mock('../../store/workspaceBridge', () => ({
    registerAiAgentWorkspaceRuntimeBridge: vi.fn()
}));

vi.mock('../../providers/context/HttpConversationQueryProvider', () => ({
    toConversationQueryProvider: vi.fn(() => ({
        getConversations: mocks.getConversations
    }))
}));

vi.mock('@packages/ui', async () => {
    const actual = await vi.importActual<typeof import('@packages/ui')>('@packages/ui');
    return {
        ...actual,
        openConversationImportDialog: vi.fn(async () => null)
    };
});

describe('createAiAgentPlugin', () => {
    beforeEach(() => {
        mocks.mockProvider.sendMessage.mockClear();
        mocks.mockProvider.abort.mockClear();
        mocks.chatStore.setProviderCatalog.mockClear();
        mocks.chatStore.setHistoryProviders.mockClear();
        mocks.chatStore.setAgentRuntime.mockClear();
        mocks.chatStore.setRuntimeMode.mockClear();
        mocks.chatStore.setModelProviderResolver.mockClear();
        mocks.chatStore.setProviderModelsResolver.mockClear();
        mocks.chatStore.setProviders.mockClear();
        mocks.chatStore.setExternalFileImportHandler.mockClear();
        mocks.chatStore.initializeProviderCatalog.mockClear();
        mocks.chatStore.init.mockClear();
        mocks.chatStore.resolveSendTarget.mockClear();
        mocks.chatStore.currentConversation = null;
        mocks.chatStore.conversations = [];
        mocks.chatStore.getConversationsByAgent.mockClear();
        mocks.getConversations.mockReset();
        mocks.getConversations.mockResolvedValue([]);
        mocks.compareStore.setRuntime.mockClear();
    });

    it('registers language-model and document-scoped conversation contributions', async () => {
        const { createAiAgentPlugin } = await import('./createAiAgentPlugin');
        const registerLanguageModel = vi.fn();
        const registerRightPanelTab = vi.fn();

        await createAiAgentPlugin({
            runtimeMode: 'web',
            useMockRuntime: true,
            useMockSync: true,
            useMockHistoryProviders: true,
            storage: {
                getItem() {
                    return null;
                },
                setItem() {}
            }
        }).setup({
            registerLanguageModel,
            registerGlobalView: vi.fn(),
            registerRightPanelTab,
            registerWorkspaceSelectionView: vi.fn(),
            registerInsertLinkType: vi.fn(),
            registerDocumentImport: vi.fn(),
            registerNodePresentation: vi.fn(),
            getContributionQuery: vi.fn(() => ({
                getGlobalViews: () => [],
                getRightPanelTabs: () => [],
                getWorkspaceSelectionViews: () => [],
                getInsertLinkTypes: () => [],
                getDocumentImports: () => [],
                getLanguageModels: () => [],
                getNodePresentations: () => []
            })),
            getRuntimeContext: vi.fn(() => ({
                currentError: null,
                clearCurrentError() {},
                beforeRouteNavigate() {},
                publishWorkspaceSelectionChanged() {},
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
                postPluginMessage() {},
                postHostEvent() {},
                subscribeHostEvent() {
                    return () => undefined;
                }
            })),
            getHostContext: vi.fn(() => ({
                environment: {
                    platform: 'web'
                },
                hasCapability() {
                    return false;
                },
                getCapability() {
                    return null;
                }
            }))
        });

        expect(registerLanguageModel).toHaveBeenCalledTimes(1);
        const contribution = registerLanguageModel.mock.calls[0]?.[0];
        expect(contribution.id).toBe('ai-agent-default-language-model');

        const result = await contribution.generateText('整理这个文字稿', {
            system: '你是总结助手。'
        });

        expect(result).toBe('mock response');
        expect(mocks.chatStore.resolveSendTarget).toHaveBeenCalledTimes(1);
        expect(mocks.mockProvider.sendMessage).toHaveBeenCalledWith(
            'System:\n你是总结助手。\n\nUser:\n整理这个文字稿',
            {
                modelId: 'mock-model',
                modelOptions: { deepThink: true },
                reasoningEffort: 'high'
            },
            expect.any(Function)
        );

        const inFlightConversation = {
            id: 'conversation-in-flight',
            title: 'Guide discussion',
            origin: 'local',
            agentKey: '/docs/',
            documentPaths: ['/docs/guide.md'],
            updatedAt: 1,
            messages: []
        };
        mocks.chatStore.currentConversation = inFlightConversation;
        mocks.chatStore.conversations = [];

        const conversationTab = registerRightPanelTab.mock.calls
            .map(([contribution]) => contribution)
            .find((contribution) => contribution.id === 'conversations');
        expect(conversationTab).toBeDefined();

        await expect(conversationTab.getBadgeCount({
            activeScopeKey: '/docs/',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: ''
            },
            contextProvider: {} as any
        })).resolves.toBe(1);

        await expect(conversationTab.getBadgeCount({
            activeScopeKey: '/docs/',
            activeDocument: {
                path: '/docs/other.md',
                mimeType: 'text/markdown',
                dataBase64: ''
            },
            contextProvider: {} as any
        })).resolves.toBe(0);
        expect(mocks.chatStore.currentConversation).toBe(inFlightConversation);
    });
});
