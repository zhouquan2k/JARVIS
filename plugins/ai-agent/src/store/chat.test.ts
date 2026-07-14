import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type {
    Conversation,
    ConversationHistorySummary,
    HistoryListQueryOptions,
    HttpApiError,
    IConversationPersistProvider,
    IContextProvider,
    IExternalConversationProvider,
    IModelProvider,
    ResolvedAgentConfig,
    WorkspaceContext
} from '@plugins/ai-agent/src/internal';
import { encodeTextDocument } from '@plugins/ai-agent/src/internal';
import { createMockContextProvider } from '@plugins/ai-agent/src/testing';
import type { ProviderConfig } from '@packages/core/config';
import { useChatStore } from './chat';

const chatgptOptionDefinitions = [
    {
        key: 'web_search',
        label: '联网搜索',
        type: 'boolean' as const,
        conflictsWith: ['deep_research']
    },
    {
        key: 'deep_research',
        label: 'Deep Research',
        type: 'boolean' as const,
        conflictsWith: ['web_search']
    }
];

const geminiOptionDefinitions = [
    {
        key: 'web_search',
        label: '联网搜索',
        type: 'boolean' as const,
        conflictsWith: ['deep_research']
    },
    {
        key: 'deep_research',
        label: 'Deep Research',
        type: 'boolean' as const,
        conflictsWith: ['web_search']
    }
];

class MockModelProvider implements IModelProvider {
    id = 'mock-provider';
    promptsUsed: string[] = [];
    optionsUsed: Array<Record<string, unknown>> = [];
    acceptedMimeTypes = ['text/plain', 'text/markdown', 'application/pdf'];

    async getAvailableModels() {
        return {
            models: [{ id: 'mock-model', name: 'Mock Model' }],
            defaultModel: 'mock-model'
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

    async generateConversationTitle(prompt: string, maxLength = 30): Promise<string> {
        return prompt.length <= maxLength ? prompt : `${prompt.slice(0, maxLength)}...`;
    }

    async sendMessage(
        prompt: string,
        _options = {},
        onUpdate: (update: { text: string }) => void
    ): Promise<{ text: string; conversationId: string; messageId: string }> {
        this.promptsUsed.push(prompt);
        this.optionsUsed.push(_options as Record<string, unknown>);
        const text = `reply:${prompt}`;
        onUpdate({
            text,
            annotations: [
                {
                    kind: 'cite',
                    range: { start: 0, end: text.length },
                    payload: {
                        refId: 'ref-1',
                        label: '[1]'
                    }
                }
            ]
        });
        return {
            text,
            conversationId: 'conversation-id',
            messageId: 'message-id',
            annotations: [
                {
                    kind: 'cite',
                    range: { start: 0, end: text.length },
                    payload: {
                        refId: 'ref-1',
                        label: '[1]'
                    }
                }
            ]
        };
    }

    abort(): void {}
}

class AbortableMockModelProvider extends MockModelProvider {
    aborted = false;
    private rejectPending: ((reason?: unknown) => void) | null = null;

    override async sendMessage(
        prompt: string,
        options = {},
        onUpdate: (update: { text: string }) => void
    ): Promise<{ text: string; conversationId: string; messageId: string }> {
        this.promptsUsed.push(prompt);
        this.optionsUsed.push(options as Record<string, unknown>);
        onUpdate({ text: `reply:${prompt}` });

        await new Promise<never>((_, reject) => {
            this.rejectPending = reject;
        });

        throw new Error('unreachable');
    }

    override abort(): void {
        this.aborted = true;
        const error = new Error('Aborted');
        error.name = 'AbortError';
        this.rejectPending?.(error);
        this.rejectPending = null;
    }
}

class PendingMockModelProvider extends MockModelProvider {
    resolvePending: (() => void) | null = null;

    override async sendMessage(
        prompt: string,
        options = {},
        onUpdate: (update: { text: string }) => void
    ): Promise<{ text: string; conversationId: string; messageId: string }> {
        this.promptsUsed.push(prompt);
        this.optionsUsed.push(options as Record<string, unknown>);
        onUpdate({ text: `reply:${prompt}` });

        await new Promise<void>((resolve) => {
            this.resolvePending = resolve;
        });

        return {
            text: `reply:${prompt}`,
            conversationId: 'pending-conversation-id',
            messageId: 'pending-message-id'
        };
    }
}

class ArchiveResultProvider extends MockModelProvider {
    constructor(private readonly archiveResponseText: string) {
        super();
    }

    override async sendMessage(
        prompt: string,
        options = {},
        onUpdate: (update: { text: string }) => void
    ): Promise<{ text: string; conversationId: string; messageId: string }> {
        this.promptsUsed.push(prompt);
        this.optionsUsed.push(options as Record<string, unknown>);
        onUpdate({ text: this.archiveResponseText });
        return {
            text: this.archiveResponseText,
            conversationId: 'archive-conversation-id',
            messageId: 'archive-message-id'
        };
    }
}

class FunctionalPartsProvider extends MockModelProvider {
    override async sendMessage(
        prompt: string,
        options = {},
        onUpdate: (update: { text: string; functionalParts?: Conversation['messages'][number]['functionalParts'] }) => void
    ): Promise<{
        text: string;
        conversationId: string;
        messageId: string;
        functionalParts: Conversation['messages'][number]['functionalParts'];
    }> {
        this.promptsUsed.push(prompt);
        this.optionsUsed.push(options as Record<string, unknown>);
        const functionalParts = [
            {
                id: `part-${this.promptsUsed.length}`,
                kind: 'tool_call' as const,
                title: 'Tool call',
                content: '{"name":"lookup"}'
            }
        ];
        const text = `reply:${prompt}`;
        onUpdate({ text, functionalParts });
        return {
            text,
            conversationId: 'functional-conversation-id',
            messageId: 'functional-message-id',
            functionalParts
        };
    }
}

class FailingMockModelProvider extends MockModelProvider {
    override async sendMessage(
        prompt: string,
        options = {},
        _onUpdate: (update: { text: string }) => void
    ): Promise<{ text: string; conversationId: string; messageId: string }> {
        this.promptsUsed.push(prompt);
        this.optionsUsed.push(options as Record<string, unknown>);
        throw new Error('Provider unavailable');
    }
}

class TitleFailingMockModelProvider extends MockModelProvider {
    override async generateConversationTitle(): Promise<string> {
        throw new Error('Title provider unavailable');
    }
}

class StaticTitleMockModelProvider extends MockModelProvider {
    constructor(private readonly title: string) {
        super();
    }

    override async generateConversationTitle(): Promise<string> {
        return this.title;
    }
}

class MockStorageProvider implements IConversationPersistProvider {
    id = 'mock-storage';
    syncNowCalls = 0;

    constructor(public readonly conversations: Conversation[]) {}

    async saveConversation(chat: Conversation): Promise<void> {
        const index = this.conversations.findIndex((item) => item.id === chat.id);
        if (index === -1) {
            this.conversations.unshift(chat);
            return;
        }
        this.conversations[index] = chat;
    }

    async getConversation(id: string): Promise<Conversation | null> {
        return this.conversations.find((item) => item.id === id) || null;
    }

    async getAllConversations(): Promise<Conversation[]> {
        return [...this.conversations].sort((a, b) => b.updatedAt - a.updatedAt);
    }

    async deleteConversation(id: string): Promise<void> {
        const index = this.conversations.findIndex((item) => item.id === id);
        if (index >= 0) {
            this.conversations.splice(index, 1);
        }
    }

    async syncNow(): Promise<void> {
        this.syncNowCalls += 1;
    }
}

class FailingStorageProvider extends MockStorageProvider {
    constructor(conversations: Conversation[], private readonly error: Error) {
        super(conversations);
    }

    override async deleteConversation(_id: string): Promise<void> {
        throw this.error;
    }
}

class MockHistoryProvider implements IExternalConversationProvider {
    id = 'chatgpt-web';
    historyListCalls: HistoryListQueryOptions[] = [];

    constructor(
        private readonly summaries: ConversationHistorySummary[],
        private readonly details: Record<string, Conversation>
    ) {}

    async getHistoryList(options: HistoryListQueryOptions = {}): Promise<ConversationHistorySummary[]> {
        this.historyListCalls.push({ ...options });
        const normalizedQuery = options.query?.trim().toLowerCase() || '';
        if (!normalizedQuery) {
            return this.summaries.map((item) => ({ ...item }));
        }

        return this.summaries
            .filter((item) => {
                const detail = this.details[item.id];
                const haystacks = [
                    item.title,
                    ...(detail?.messages.map((message) => message.content) || [])
                ];
                return haystacks.some((value) => value.toLowerCase().includes(normalizedQuery));
            })
            .map((item) => ({ ...item }));
    }

    async getHistoryDetail(externalId: string): Promise<Conversation> {
        const detail = this.details[externalId];
        if (!detail) {
            throw new Error(`Missing conversation ${externalId}`);
        }
        return {
            ...detail,
            messages: detail.messages.map((message) => ({ ...message }))
        };
    }
}

class DeferredHistoryProvider extends MockHistoryProvider {
    private pendingResolve: (() => void) | null = null;

    async getHistoryDetail(externalId: string): Promise<Conversation> {
        await new Promise<void>((resolve) => {
            this.pendingResolve = resolve;
        });

        return super.getHistoryDetail(externalId);
    }

    resolvePendingDetail() {
        this.pendingResolve?.();
        this.pendingResolve = null;
    }
}

function createConversationContextProvider(
    input: { nodes: WorkspaceContext['nodes']; agentConfigs?: Record<string, ResolvedAgentConfig> }
): IContextProvider {
    const taskProvider = {
        getTasks: vi.fn().mockResolvedValue([]),
        createTask: vi.fn(),
        updateTask: vi.fn(),
        deleteTask: vi.fn(),
        setTaskCompleted: vi.fn()
    };

    const context: WorkspaceContext = {
        nodes: input.nodes,
        folderMetadata: Object.fromEntries(
            Object.entries(input.agentConfigs ?? {}).map(([key, agent]) => [
                key,
                { scopeKey: key, data: agent as unknown as Record<string, unknown> }
            ])
        )
    };

    return {
        id: 'conversation-context',
        initializeAccess: vi.fn().mockResolvedValue(undefined),
        getContext: vi.fn().mockResolvedValue(context),
        getFolderMetadata: vi.fn().mockResolvedValue(null),
        getConversations: vi.fn().mockResolvedValue([]),
        getTaskProvider: vi.fn(() => taskProvider),
        getProjectDocuments: vi.fn().mockResolvedValue([]),
        readDocument: vi.fn(),
        writeDocument: vi.fn(),
        createNode: vi.fn(),
        deleteNode: vi.fn(),
        renameNode: vi.fn(),
        searchInScope: vi.fn()
    } as unknown as IContextProvider;
}

describe('useChatStore workspace history flow', () => {
    const providerCatalog: ProviderConfig[] = [
        {
            id: 'mock-provider',
            name: 'Mock Provider',
            models: [{ id: 'static-model', name: 'Static Model' }],
            defaultModel: 'static-model',
            supportedRuntimeModes: ['web']
        },
        {
            id: 'gemini-api',
            name: 'Gemini API',
            models: [{ id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' }],
            defaultModel: 'gemini-2.5-pro',
            supportedRuntimeModes: ['web']
        },
        {
            id: 'other-provider',
            name: 'Other Provider',
            models: [{ id: 'other-static', name: 'Other Static' }],
            defaultModel: 'other-static',
            supportedRuntimeModes: ['web']
        }
    ];

    beforeEach(() => {
        setActivePinia(createPinia());
        const storage = new Map<string, string>();
        vi.stubGlobal('localStorage', {
            getItem: vi.fn((key: string) => storage.get(key) ?? null),
            setItem: vi.fn((key: string, value: string) => {
                storage.set(key, value);
            }),
            removeItem: vi.fn((key: string) => {
                storage.delete(key);
            }),
            clear: vi.fn(() => {
                storage.clear();
            })
        });
    });

    const scopedAgent: ResolvedAgentConfig = {
        name: 'Docs Agent',
        description: 'Documentation specialist',
        instructions: 'Use documentation context only.',
        effectiveInstructions: 'Use documentation context only.',
        modelProviderName: 'gemini-api',
        modelName: 'gemini-2.5-pro',
        scopePath: '/docs',
        sourcePaths: ['/docs/.agent.json'],
        tools: [{ id: 'read_document', description: 'Read docs' }],
        skills: [{ id: 'summarize', description: 'Summarize docs' }]
    };
    const archiveAgent: ResolvedAgentConfig = {
        name: 'Archive Agent',
        description: 'Archive specialist',
        instructions: 'Use archive context only.',
        effectiveInstructions: 'Use archive context only.',
        modelProviderName: 'other-provider',
        modelName: 'other-static',
        scopePath: '/archive',
        sourcePaths: ['/archive/.agent.json'],
        tools: [{ id: 'search_in_scope', description: 'Search archive' }],
        skills: [{ id: 'archive', description: 'Archive docs' }]
    };

    it('marks imported external history items from local metadata', async () => {
        const storage = new MockStorageProvider([
            {
                id: 'local-1',
                title: 'Imported chat',
                origin: 'chatgpt-web',
                externalId: 'remote-1',
                backendId: 'remote-1',
                updatedAt: 3,
                messages: []
            }
        ]);
        const history = new MockHistoryProvider(
            [
                { id: 'remote-1', title: 'Imported chat', updatedAt: 2, origin: 'chatgpt-web' },
                { id: 'remote-2', title: 'Fresh chat', updatedAt: 1, origin: 'chatgpt-web' }
            ],
            {}
        );

        const store = useChatStore();
        store.setProviders(new MockModelProvider(), storage, history);

        await store.init();
        await store.loadExternalHistory();

        expect(store.externalHistoryItems.map((item) => ({ id: item.id, imported: item.isImported }))).toEqual([
            { id: 'remote-1', imported: true },
            { id: 'remote-2', imported: false }
        ]);
    });

    it('reuses existing imported conversation instead of duplicating it', async () => {
        const existingConversation: Conversation = {
            id: 'local-existing',
            title: 'Imported chat',
            origin: 'chatgpt-web',
            externalId: 'remote-1',
            backendId: 'remote-1',
            updatedAt: 100,
            messages: [
                { id: 'm1', role: 'user', content: 'hello' }
            ]
        };
        const storage = new MockStorageProvider([existingConversation]);
        const history = new MockHistoryProvider(
            [{ id: 'remote-1', title: 'Imported chat', updatedAt: 90, origin: 'chatgpt-web' }],
            {
                'remote-1': {
                    id: 'preview-1',
                    title: 'Imported chat',
                    origin: 'chatgpt-web',
                    externalId: 'remote-1',
                    backendId: 'remote-1',
                    updatedAt: 90,
                    messages: [
                        { id: 'pm1', role: 'user', content: 'preview' }
                    ]
                }
            }
        );

        const store = useChatStore();
        store.setProviders(new MockModelProvider(), storage, history);

        await store.init();
        await store.previewExternalConversation('chatgpt-web', 'remote-1');
        expect(store.isPreviewing).toBe(true);
        expect(store.previewConversation?.externalId).toBe('remote-1');

        await store.importPreviewConversation();

        expect(store.isPreviewing).toBe(false);
        expect(store.historySource).toBe('local');
        expect(store.currentConversation?.id).toBe('local-existing');
        expect((await storage.getAllConversations()).length).toBe(1);
    });

    it('tracks the loading external item while preview detail is pending', async () => {
        const storage = new MockStorageProvider([]);
        const history = new DeferredHistoryProvider(
            [{ id: 'remote-1', title: 'Imported chat', updatedAt: 90, origin: 'chatgpt-web' }],
            {
                'remote-1': {
                    id: 'preview-1',
                    title: 'Imported chat',
                    origin: 'chatgpt-web',
                    externalId: 'remote-1',
                    backendId: 'remote-1',
                    updatedAt: 90,
                    messages: [
                        { id: 'pm1', role: 'user', content: 'preview' }
                    ]
                }
            }
        );

        const store = useChatStore();
        store.setProviders(new MockModelProvider(), storage, history);

        await store.init();
        const loadingPromise = store.previewExternalConversation('chatgpt-web', 'remote-1');

        expect(store.isExternalPreviewLoading).toBe(true);
        expect(store.externalPreviewLoadingId).toBe('remote-1');

        history.resolvePendingDetail();
        await loadingPromise;

        expect(store.isExternalPreviewLoading).toBe(false);
        expect(store.externalPreviewLoadingId).toBeNull();
    });

    it('loads provider-driven model catalogs before enabling selections', async () => {
        const store = useChatStore();
        store.setProviders(new MockModelProvider(), new MockStorageProvider([]));
        store.setProviderModelsResolver(async (providerId: string) => {
            if (providerId === 'mock-provider') {
                return {
                    models: [{ id: 'dynamic-model', name: 'Dynamic Model' }],
                    defaultModel: 'dynamic-model'
                };
            }

            return {
                models: [{ id: 'other-dynamic', name: 'Other Dynamic' }],
                defaultModel: 'other-dynamic'
            };
        });

        await store.initializeProviderCatalog(providerCatalog);
        expect(store.currentProviderId).toBe('mock-provider');
        expect(store.currentModelId).toBe('dynamic-model');
        expect(store.isCurrentProviderModelsLoading).toBe(false);

        await store.setCurrentModelProvider('other-provider');
        expect(store.currentProviderId).toBe('other-provider');
        expect(store.currentModelId).toBe('other-dynamic');
    });

    it('can force reload a provider-driven model catalog after auth state changes', async () => {
        const store = useChatStore();
        let reloadCount = 0;
        store.setProviders(new MockModelProvider(), new MockStorageProvider([]));
        store.setProviderModelsResolver(async (providerId: string) => {
            if (providerId !== 'mock-provider') {
                return {
                    models: [{ id: 'other-dynamic', name: 'Other Dynamic' }],
                    defaultModel: 'other-dynamic'
                };
            }

            reloadCount += 1;
            if (reloadCount === 1) {
                return {
                    models: [{ id: 'fallback-model', name: 'Fallback Model' }],
                    defaultModel: 'fallback-model'
                };
            }

            return {
                models: [
                    { id: 'fallback-model', name: 'Fallback Model' },
                    { id: 'gpt-5', name: 'GPT-5' }
                ],
                defaultModel: 'gpt-5'
            };
        });

        await store.initializeProviderCatalog(providerCatalog);
        expect(store.resolveProviderConfig('mock-provider')?.models.map((model) => model.id)).toEqual(['fallback-model']);
        expect(store.currentModelId).toBe('fallback-model');

        await store.reloadProviderModels('mock-provider');

        expect(store.resolveProviderConfig('mock-provider')?.models.map((model) => model.id)).toEqual([
            'fallback-model',
            'gpt-5'
        ]);
        expect(store.currentModelId).toBe('gpt-5');
    });

    it('keeps a not-ready provider retryable (loaded:false) and reloads on the next ensure', async () => {
        const store = useChatStore();
        let calls = 0;
        store.setProviders(new MockModelProvider(), new MockStorageProvider([]));
        store.setProviderModelsResolver(async (providerId: string) => {
            if (providerId !== 'mock-provider') {
                return { models: [{ id: 'other-dynamic', name: 'Other Dynamic' }], defaultModel: 'other-dynamic' };
            }
            calls += 1;
            if (calls === 1) {
                const err = new Error('model picker not ready');
                err.name = 'ModelsNotReadyError';
                throw err;
            }
            return {
                models: [{ id: 'live-a', name: 'Live A' }, { id: 'live-b', name: 'Live B' }],
                defaultModel: 'live-a'
            };
        });

        await store.initializeProviderCatalog(providerCatalog);
        // 第一次未就绪：应用静态兜底，但 loaded 保持 false（可重试），不被锁死。
        expect(store.providerModelStates['mock-provider']?.loaded).toBe(false);
        expect(calls).toBe(1);

        // 下次 ensure（未 loaded）重新请求 → 读到真实模型。
        await store.ensureProviderModelsLoaded('mock-provider');
        expect(store.providerModelStates['mock-provider']?.loaded).toBe(true);
        expect(store.resolveProviderConfig('mock-provider')?.models.map((m) => m.id)).toEqual(['live-a', 'live-b']);
        expect(calls).toBe(2);
    });

    it('regression: restores the conversation-persisted modelId once an async (DOM-style) catalog becomes ready after a not-ready fallback', async () => {
        // 回归用例：DOM provider 首次目录未就绪时，会先落到静态兜底的 defaultModel；
        // 此前一旦真实目录异步就绪，applyProviderModelCatalog 会无条件套用 provider.defaultModel，
        // 把用户/会话持久化的上次模型静默替换成 provider 默认模型（如 preferredDefaultModel）。
        const storage = new MockStorageProvider([
            {
                id: 'dom-conv',
                title: 'DOM chat',
                origin: 'local',
                updatedAt: 1,
                messages: [],
                modelSelection: {
                    providerId: 'mock-provider',
                    modelId: 'sonnet-4-5',
                    modelOptions: {},
                    reasoningEffort: 'high',
                    explicit: true
                }
            } as unknown as Conversation
        ]);
        const store = useChatStore();
        store.setProviders(new MockModelProvider(), storage);

        let calls = 0;
        store.setProviderModelsResolver(async (providerId: string) => {
            if (providerId !== 'mock-provider') {
                return { models: [{ id: 'other-dynamic', name: 'Other Dynamic' }], defaultModel: 'other-dynamic' };
            }
            calls += 1;
            if (calls === 1) {
                const err = new Error('model picker not ready');
                err.name = 'ModelsNotReadyError';
                throw err;
            }
            return {
                models: [
                    { id: 'preferred-default', name: 'Preferred Default' },
                    { id: 'sonnet-4-5', name: 'Sonnet 4.5' }
                ],
                defaultModel: 'preferred-default'
            };
        });

        // initializeProviderCatalog 会自动为「目录首项」预取模型；把 mock-provider 排到非首位，
        // 避免这次预取提前消耗掉下面模拟的「第一次未就绪」，干扰对 selectLocalConversation 触发的
        // 那次请求的观察。
        await store.initializeProviderCatalog([providerCatalog[2], providerCatalog[0], providerCatalog[1]]);
        await store.selectLocalConversation('dom-conv');

        // 第一次目录未就绪：落到静态兜底目录的唯一模型，但记住了期望恢复的 modelId。
        expect(store.currentModelId).toBe('static-model');
        expect(store.providerModelStates['mock-provider']?.loaded).toBe(false);

        // 真实目录异步就绪：应恢复持久化的 'sonnet-4-5'，而不是新目录的 defaultModel。
        await store.ensureProviderModelsLoaded('mock-provider');
        expect(store.currentModelId).toBe('sonnet-4-5');
    });

    it('restores conversation model selection and normalizes conflicting options', async () => {
        const storage = new MockStorageProvider([
            {
                id: 'conversation-1',
                title: 'Model selection',
                origin: 'local',
                updatedAt: 10,
                modelSelection: {
                    providerId: 'mock-provider',
                    modelId: 'dynamic-model',
                    modelOptions: {
                        web_search: true
                    }
                },
                messages: [
                    { id: 'user-1', role: 'user', content: 'hello' }
                ]
            }
        ]);
        const store = useChatStore();
        store.setProviders(new MockModelProvider(), storage);
        store.setProviderModelsResolver(async (providerId: string) => {
            if (providerId === 'mock-provider') {
                return {
                    models: [
                        { id: 'dynamic-model', name: 'Dynamic Model', options: chatgptOptionDefinitions },
                        { id: 'research-only', name: 'Research Only', options: geminiOptionDefinitions }
                    ],
                    defaultModel: 'dynamic-model'
                };
            }

            return {
                models: [{ id: 'other-dynamic', name: 'Other Dynamic' }],
                defaultModel: 'other-dynamic'
            };
        });

        await store.initializeProviderCatalog(providerCatalog);
        await store.selectLocalConversation('conversation-1');

        expect(store.currentProviderId).toBe('mock-provider');
        expect(store.currentModelId).toBe('dynamic-model');
        expect(store.currentModelOptions).toEqual({ web_search: true });
        expect(store.currentReasoningEffort).toBe('high');

        store.setCurrentModelOption('deep_research', true);
        expect(store.currentModelOptions).toEqual({ deep_research: true });
        expect(store.currentConversation?.modelSelection).toEqual({
            providerId: 'mock-provider',
            modelId: 'dynamic-model',
            modelOptions: { deep_research: true },
            reasoningEffort: 'high'
        });

        store.setCurrentModel('research-only');
        expect(store.currentModelOptions).toEqual({ deep_research: true });
        expect(store.currentConversation?.modelSelection).toEqual({
            providerId: 'mock-provider',
            modelId: 'research-only',
            modelOptions: { deep_research: true },
            reasoningEffort: 'high'
        });
    });

    it('queues attachments, sends them with the prompt, and persists assistant annotations', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);

        const file = {
            name: 'diagram.png',
            type: 'image/png',
            size: 3,
            async arrayBuffer() {
                return new Uint8Array([1, 2, 3]).buffer;
            }
        } as File;

        await store.queueAttachments([file]);
        expect(store.draftAttachments).toHaveLength(1);
        expect(store.draftAttachments[0]).toMatchObject({
            type: 'image',
            name: 'diagram.png',
            previewBase64: 'AQID'
        });

        await store.sendMessage('请分析');

        expect(provider.optionsUsed[0]?.attachments).toEqual([
            expect.objectContaining({
                name: 'diagram.png',
                mimeType: 'image/png',
                base64Data: 'AQID'
            })
        ]);
        expect(store.draftAttachments).toHaveLength(0);
        expect(store.currentConversation?.messages[0]).toMatchObject({
            role: 'user',
            content: '请分析',
            questionId: expect.any(String),
            createdAt: expect.any(Number),
            attachments: [
                expect.objectContaining({
                    name: 'diagram.png'
                })
            ]
        });
        expect(store.currentConversation?.messages[1]).toMatchObject({
            role: 'assistant',
            questionId: store.currentConversation?.messages[0]?.questionId,
            createdAt: expect.any(Number)
        });
        expect(store.questionIndexItems).toEqual([
            expect.objectContaining({
                questionId: store.currentConversation?.messages[0]?.questionId,
                title: '请分析',
                starred: false
            })
        ]);
        expect(store.currentConversation?.messages[1]?.annotations).toEqual([
            expect.objectContaining({
                kind: 'cite'
            })
        ]);
    });

    it('rejects queued attachments when the current provider does not support uploads', async () => {
        const provider = new MockModelProvider();
        provider.acceptedMimeTypes = [];
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);

        const file = {
            name: 'diagram.png',
            type: 'image/png',
            size: 3,
            async arrayBuffer() {
                throw new Error('file should not be read');
            }
        } as File;

        await store.queueAttachments([file]);

        expect(store.draftAttachments).toEqual([]);
        expect(store.attachmentError).toBe('The current provider does not support file uploads.');
        expect(store.currentProviderSupportsAttachments).toBe(false);
    });

    it('infers markdown mime type when the browser does not provide one', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);

        const file = {
            name: 'research.md',
            type: '',
            size: 4,
            async arrayBuffer() {
                return new Uint8Array([35, 32, 84, 49]).buffer;
            }
        } as File;

        await store.queueAttachments([file]);

        expect(store.draftAttachments).toHaveLength(1);
        expect(store.draftAttachments[0]).toMatchObject({
            name: 'research.md',
            mimeType: 'text/markdown',
            type: 'file'
        });
    });

    it('passes prior visible messages as provider history for follow-up turns', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);

        await store.sendMessage('第一问');
        await store.sendMessage('第二问');

        expect(provider.optionsUsed[1]?.history).toEqual([
            {
                role: 'user',
                content: '第一问',
                attachments: undefined
            },
            {
                role: 'assistant',
                content: 'reply:第一问',
                attachments: undefined
            }
        ]);
    });

    it('persists functional parts without sending them back as provider history', async () => {
        const provider = new FunctionalPartsProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);

        await store.sendMessage('第一问');

        expect(store.currentConversation?.messages[1]?.functionalParts).toEqual([
            {
                id: 'part-1',
                kind: 'tool_call',
                title: 'Tool call',
                content: '{"name":"lookup"}'
            }
        ]);
        expect(storage.conversations[0]?.messages[1]?.functionalParts).toHaveLength(1);

        await store.sendMessage('第二问');

        expect(provider.optionsUsed[1]?.history).toEqual([
            {
                role: 'user',
                content: '第一问',
                attachments: undefined
            },
            {
                role: 'assistant',
                content: 'reply:第一问',
                attachments: undefined
            }
        ]);
    });

    it('passes normalized model options through the send pipeline and persists them on new conversations', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        store.setProviderModelsResolver(async () => ({
            models: [
                { id: 'dynamic-model', name: 'Dynamic Model', options: chatgptOptionDefinitions }
            ],
            defaultModel: 'dynamic-model'
        }));

        await store.initializeProviderCatalog(providerCatalog);
        await store.startNewConversation();

        store.setCurrentModelOption('web_search', true);
        await store.sendMessage('测试 option 透传');

        expect(provider.optionsUsed[0]?.modelOptions).toEqual({ web_search: true });
        expect(provider.optionsUsed[0]?.reasoningEffort).toBe('high');
        expect(store.currentConversation?.modelSelection).toEqual({
            providerId: 'mock-provider',
            modelId: 'dynamic-model',
            modelOptions: { web_search: true },
            reasoningEffort: 'high'
        });
        expect((await storage.getAllConversations())[0]?.modelSelection).toEqual({
            providerId: 'mock-provider',
            modelId: 'dynamic-model',
            modelOptions: { web_search: true },
            reasoningEffort: 'high'
        });
    });

    it('persists the actual last-used single-model selection when a new reply is saved', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([
            {
                id: 'conversation-2',
                title: 'Other conversation',
                origin: 'local',
                updatedAt: 1,
                messages: []
            }
        ]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        store.setProviderModelsResolver(async (providerId: string) => {
            if (providerId === 'other-provider') {
                return {
                    models: [{ id: 'other-dynamic', name: 'Other Dynamic' }],
                    defaultModel: 'other-dynamic'
                };
            }

            return {
                models: [{ id: 'dynamic-model', name: 'Dynamic Model' }],
                defaultModel: 'dynamic-model'
            };
        });

        await store.initializeProviderCatalog(providerCatalog);
        await store.setCurrentModelProviderByUser('other-provider');
        await store.startNewConversation();
        await store.sendMessage('使用 other-provider');
        const conversationId = store.currentConversation?.id;

        expect(conversationId).toBeTruthy();
        expect((await storage.getConversation(conversationId!))?.modelSelection).toEqual({
            providerId: 'other-provider',
            modelId: 'other-dynamic',
            modelOptions: {},
            reasoningEffort: 'high',
            explicit: true
        });

        await store.selectLocalConversation('conversation-2');
        await store.selectLocalConversation(conversationId!);

        expect(store.currentProviderId).toBe('other-provider');
        expect(store.currentModelId).toBe('other-dynamic');
        expect(store.currentConversation?.modelSelection).toEqual({
            providerId: 'other-provider',
            modelId: 'other-dynamic',
            modelOptions: {},
            reasoningEffort: 'high',
            explicit: true
        });
    });

    it('normalizes and persists shared web_search for Gemini-style model definitions', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        store.setProviderModelsResolver(async () => ({
            models: [
                { id: 'gemini-dynamic', name: 'Gemini Dynamic', options: geminiOptionDefinitions }
            ],
            defaultModel: 'gemini-dynamic'
        }));

        await store.initializeProviderCatalog(providerCatalog);
        await store.setCurrentModelProvider('gemini-api');
        await store.startNewConversation();

        store.setCurrentModelOption('web_search', true);
        await store.sendMessage('测试 Gemini web search');

        expect(store.currentProviderId).toBe('gemini-api');
        expect(store.currentModelId).toBe('gemini-dynamic');
        expect(store.currentModelOptions).toEqual({ web_search: true });
        expect(provider.optionsUsed[0]?.modelOptions).toEqual({ web_search: true });
        expect(store.currentConversation?.modelSelection).toEqual({
            providerId: 'gemini-api',
            modelId: 'gemini-dynamic',
            modelOptions: { web_search: true },
            reasoningEffort: 'high'
        });
    });

    it('persists the actual last-used group selection when a new reply is saved', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([
            {
                id: 'conversation-2',
                title: 'Other conversation',
                origin: 'local',
                updatedAt: 1,
                messages: []
            }
        ]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog([
            ...providerCatalog,
            {
                id: 'group',
                name: 'Group',
                models: [{ id: 'dom', name: 'DOM Team' }],
                defaultModel: 'dom',
                supportedRuntimeModes: ['web']
            }
        ]);
        store.availableProviders = [
            {
                id: 'group',
                name: 'Group',
                models: [{ id: 'dom', name: 'DOM Team' }],
                defaultModel: 'dom',
                supportedRuntimeModes: ['web']
            },
            { id: 'chatgpt-dom' },
            { id: 'gemini-dom' },
            { id: 'claude-dom' }
        ] as unknown as typeof store.availableProviders;
        store.currentProviderId = 'group';
        store.currentModelId = 'dom';
        store.currentModelSelectionExplicit = true;
        store.currentGroupMembers = [
            { providerId: 'chatgpt-dom', modelId: 'dom', name: 'ChatGPT' },
            { providerId: 'claude-dom', modelId: 'dom', name: 'Claude' }
        ];

        await store.startNewConversation();
        await store.sendMessage('使用 group');
        const conversationId = store.currentConversation?.id;

        expect(conversationId).toBeTruthy();
        expect((await storage.getConversation(conversationId!))?.modelSelection).toEqual({
            providerId: 'group',
            modelId: 'dom',
            modelOptions: {},
            reasoningEffort: 'high',
            explicit: true,
            groupMembers: [
                { providerId: 'chatgpt-dom', modelId: 'dom', name: 'ChatGPT' },
                { providerId: 'claude-dom', modelId: 'dom', name: 'Claude' }
            ]
        });

        await store.selectLocalConversation('conversation-2');
        await store.selectLocalConversation(conversationId!);

        expect(store.currentProviderId).toBe('group');
        expect(store.currentModelId).toBe('dom');
        expect(store.currentConversation?.modelSelection).toMatchObject({
            providerId: 'group',
            modelId: 'dom',
            modelOptions: {},
            reasoningEffort: 'high',
            explicit: true
        });
        expect(store.currentConversation?.modelSelection?.groupMembers?.map((member) => ({
            providerId: member.providerId,
            name: member.name
        }))).toEqual([
            { providerId: 'chatgpt-dom', name: 'ChatGPT' },
            { providerId: 'claude-dom', name: 'Claude' }
        ]);
    });

    it('allows overriding reasoning effort and persists it through the send pipeline', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);

        await store.initializeProviderCatalog(providerCatalog);
        await store.startNewConversation();

        store.setCurrentReasoningEffort('low');
        await store.sendMessage('测试推理强度');

        expect(provider.optionsUsed[0]?.reasoningEffort).toBe('low');
        expect(store.currentConversation?.modelSelection).toEqual({
            providerId: 'mock-provider',
            modelId: 'static-model',
            modelOptions: {},
            reasoningEffort: 'low'
        });
        expect((await storage.getAllConversations())[0]?.modelSelection).toEqual({
            providerId: 'mock-provider',
            modelId: 'static-model',
            modelOptions: {},
            reasoningEffort: 'low'
        });
    });

    it('binds a new agent-mode conversation to the saved selected node name when available', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);

        await store.initializeProviderCatalog(providerCatalog);
        store.setWorkspaceMode('agent');
        store.saveAgentViewStatus({
            selectedNodePath: '/docs/archive',
            activePath: '/docs/archive/note.md',
            activeConversationId: null
        });

        await store.startNewConversation();

        expect(store.currentConversation?.boundNodeName).toBe('archive');
        expect((await storage.getAllConversations())).toHaveLength(0);
    });

    it('binds a new workspace conversation to the active agent and document immediately', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);

        await store.initializeProviderCatalog(providerCatalog);
        store.setWorkspaceMode('agent');
        store.setWorkspaceContext({
            activeAgentKey: '/docs/.agent.json',
            selectedNodePath: '/docs/guide.md',
            activePath: '/docs/guide.md',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Guide'),
                updatedAt: 1,
                version: 'v1',
                canWrite: true
            },
            contextProvider: null
        });

        await store.startNewConversation({
            boundNodeName: 'guide.md',
            agentKey: '/docs/.agent.json',
            documentPath: '/docs/guide.md',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Guide'),
                updatedAt: 1,
                version: 'v1',
                canWrite: true
            }
        });

        expect(store.currentConversation).toMatchObject({
            title: 'New Chat',
            boundNodeName: 'guide.md',
            agentKey: '/docs/',
            documentPaths: ['/docs/guide.md']
        });
    });

    it('rebinds the primary conversation document while preserving referenced document paths', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([
            {
                id: 'conversation-1',
                title: 'Existing chat',
                origin: 'local',
                agentKey: '/docs/',
                documentPaths: ['/docs/guide.md', '/docs/appendix.md'],
                updatedAt: 1,
                messages: []
            }
        ]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);
        store.currentConversation = {
            id: 'conversation-1',
            title: 'Existing chat',
            origin: 'local',
            agentKey: '/docs/',
            documentPaths: ['/docs/guide.md', '/docs/appendix.md'],
            updatedAt: 1,
            messages: []
        };

        await store.bindConversationToDocument('conversation-1', {
            documentPath: '/docs/reference.md',
            previousDocumentPath: '/docs/guide.md'
        });

        expect((await storage.getConversation('conversation-1'))?.documentPaths).toEqual([
            '/docs/reference.md',
            '/docs/appendix.md'
        ]);
    });

    it('rebinds the primary document for imported conversations as well', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([
            {
                id: 'conversation-imported',
                title: 'Imported chat',
                origin: 'gemini-web',
                agentKey: '/docs/',
                documentPaths: ['/docs/guide.md', '/docs/appendix.md'],
                updatedAt: 1,
                messages: []
            }
        ]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);
        store.currentConversation = {
            id: 'conversation-imported',
            title: 'Imported chat',
            origin: 'gemini-web',
            agentKey: '/docs/',
            documentPaths: ['/docs/guide.md', '/docs/appendix.md'],
            updatedAt: 1,
            messages: []
        };

        await store.bindConversationToDocument('conversation-imported', {
            documentPath: '/docs/reference.md',
            previousDocumentPath: '/docs/guide.md'
        });

        expect((await storage.getConversation('conversation-imported'))?.documentPaths).toEqual([
            '/docs/reference.md',
            '/docs/appendix.md'
        ]);
    });

    it('resets inherited workspace agent selection when starting a new chat in conversation mode', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);

        await store.initializeProviderCatalog(providerCatalog);
        store.saveWorkspaceAgentContext({
            ...scopedAgent,
            modelProviderName: 'other-provider',
            modelName: 'other-static'
        });
        store.currentProviderId = 'other-provider';
        store.currentModelId = 'other-static';

        await store.startNewConversation({ boundNodeName: null });

        expect(store.workspaceAgentContext).toBeNull();
        expect(store.currentProviderId).toBe('mock-provider');
        expect(store.currentModelId).toBe('static-model');
        expect(store.currentConversation?.modelSelection).toEqual({
            providerId: 'mock-provider',
            modelId: 'static-model',
            modelOptions: {},
            reasoningEffort: 'high'
        });
    });

    it('clears active agent and document context when starting a new chat in conversation mode', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);

        await store.initializeProviderCatalog(providerCatalog);
        store.setActiveAgentContext(scopedAgent);
        store.saveWorkspaceAgentContext({
            ...scopedAgent,
            modelProviderName: 'other-provider',
            modelName: 'other-static'
        });
        store.setWorkspaceContext({
            activeAgentKey: '/docs/.agent.json',
            selectedNodePath: '/docs/guide.md',
            activePath: '/docs/guide.md',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Guide'),
                updatedAt: 1,
                version: 'v1',
                canWrite: true
            },
            contextProvider: null
        });
        store.saveAgentViewStatus({
            selectedNodePath: '/docs/archive',
            activePath: '/docs/archive/note.md',
            activeConversationId: null
        });

        await store.startNewConversation({ boundNodeName: null });

        expect(store.activeAgentContext).toBeNull();
        expect(store.workspaceAgentContext).toBeNull();
        expect(store.activeWorkspaceAgentKey).toBeNull();
        expect(store.activeWorkspaceSelectedNodePath).toBeNull();
        expect(store.activeWorkspacePath).toBeNull();
        expect(store.activeWorkspaceDocument).toBeNull();
        expect(store.activeWorkspaceContextProvider).toBeNull();
        expect(store.currentConversation?.boundNodeName).toBeUndefined();
        expect(store.currentConversation?.agentKey).toBeUndefined();
        expect(store.currentConversation?.documentPaths).toBeUndefined();

        await store.sendMessage('普通聊天');

        expect(provider.promptsUsed[0]).toBe('普通聊天');
        expect(provider.optionsUsed[0]?.attachments).toEqual([]);
        expect(store.currentConversation?.agentKey).toBeUndefined();
        expect(store.currentConversation?.documentPaths).toBeUndefined();
    });

    it('applies the saved workspace agent selection to the current model state', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);

        await store.initializeProviderCatalog(providerCatalog);
        store.saveWorkspaceAgentContext({
            ...scopedAgent,
            modelProviderName: 'other-provider',
            modelName: 'other-static'
        });

        await store.applyWorkspaceAgentContextSelection();

        expect(store.currentProviderId).toBe('other-provider');
        expect(store.currentModelId).toBe('other-static');
    });

    it('keeps the current model when a conversation already resolved one in memory (fullscreen toggle)', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);

        await store.initializeProviderCatalog(providerCatalog);

        // 右栏已按文档 agent 解析出模型（内存态），但新会话尚未把该选择落库到 modelSelection。
        store.currentConversation = {
            id: 'workspace-unsent',
            title: 'Doc scoped chat',
            origin: 'local',
            updatedAt: Date.now(),
            messages: []
        };
        store.currentProviderId = 'gemini-api';
        store.currentModelId = 'gemini-2.5-pro';

        // 展开全屏会持久化工作区根 agent 上下文并尝试套用其默认模型。
        store.saveWorkspaceAgentContext({
            ...scopedAgent,
            modelProviderName: 'other-provider',
            modelName: 'other-static'
        });

        await store.applyWorkspaceAgentContextSelection();

        // 纯视图切换不应改动当前对话的模型（旧实现会切到 other-provider）。
        expect(store.currentProviderId).toBe('gemini-api');
        expect(store.currentModelId).toBe('gemini-2.5-pro');
    });

    it('applies the active agent selection to the current model state by display name', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);

        await store.initializeProviderCatalog([
            {
                id: 'mock-provider',
                name: 'Mock Provider',
                models: [{ id: 'static-model', name: 'Static Model' }],
                defaultModel: 'static-model',
                supportedRuntimeModes: ['web']
            },
            {
                id: 'other-provider',
                name: 'Other Provider',
                models: [{ id: 'other-static', name: 'Other Static' }],
                defaultModel: 'other-static',
                supportedRuntimeModes: ['web']
            }
        ]);
        store.setActiveAgentContext({
            ...scopedAgent,
            modelProviderName: 'other-provider',
            modelName: 'Other Static'
        });

        await store.applyActiveAgentContextSelection();

        expect(store.currentProviderId).toBe('other-provider');
        expect(store.currentModelId).toBe('other-static');
    });

    it('attaches the active text document with a stable prompt prefix when an active agent context is present', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);
        store.setWorkspaceMode('agent');

        store.setActiveAgentContext({
            ...scopedAgent,
            modelProviderName: undefined,
            modelName: undefined
        });
        store.setWorkspaceContext({
            activeAgentKey: '/docs/.agent.json',
            selectedNodePath: '/docs/guide.md',
            activePath: '/docs/guide.md',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Guide')
            },
            contextProvider: null
        });
        await store.sendMessage('请分析当前文档');

        expect(provider.promptsUsed[0]).toBe('当前文档已作为附件提供：/docs/guide.md\n\n请分析当前文档');
        expect(provider.optionsUsed[0]?.attachments).toEqual([
            expect.objectContaining({
                id: 'active-document:/docs/guide.md',
                name: 'guide.md',
                mimeType: 'text/markdown',
                base64Data: encodeTextDocument('# Guide')
            })
        ]);
        expect(store.currentConversation?.messages[0]?.content).toBe('当前文档已作为附件提供：/docs/guide.md\n\n请分析当前文档');
        expect(store.currentConversation?.messages[0]?.attachments).toEqual([
            expect.objectContaining({
                id: 'active-document:/docs/guide.md',
                name: 'guide.md',
                mimeType: 'text/markdown',
                base64Data: encodeTextDocument('# Guide')
            })
        ]);
        expect(store.currentConversation?.messages[0]?.requestSnapshot).toEqual({
            prompt: '当前文档已作为附件提供：/docs/guide.md\n\n请分析当前文档',
            attachments: [
                expect.objectContaining({
                    id: 'active-document:/docs/guide.md',
                    name: 'guide.md',
                    mimeType: 'text/markdown',
                    base64Data: encodeTextDocument('# Guide')
                })
            ],
            activeDocumentMode: 'attachment'
        });

        store.setActiveAgentContext(null);
        await store.sendMessage('第二条消息');

        expect(provider.promptsUsed[1]).toBe('第二条消息');
    });

    it('keeps first-turn active document behavior while appending mentioned file sections', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const contextProvider = createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' },
                { path: '/docs/appendix.md', name: 'appendix.md', kind: 'file', parentPath: '/docs' }
            ],
            documents: {
                '/docs/guide.md': '# Guide',
                '/docs/appendix.md': '# Appendix'
            }
        });
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);
        store.setWorkspaceMode('agent');

        store.setActiveAgentContext({
            ...scopedAgent,
            modelProviderName: undefined,
            modelName: undefined
        });
        store.setWorkspaceContext({
            activeAgentKey: '/docs/.agent.json',
            selectedNodePath: '/docs/guide.md',
            activePath: '/docs/guide.md',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Guide')
            },
            contextProvider
        });

        await store.sendMessage('请比较 @appendix.md');

        expect(provider.promptsUsed[0]).toBe(
            '当前文档已作为附件提供：/docs/guide.md\n\n请比较 @appendix.md\n\n[引用文件: appendix.md]\n# Appendix'
        );
        expect(provider.optionsUsed[0]?.attachments).toEqual([
            expect.objectContaining({
                id: 'active-document:/docs/guide.md',
                name: 'guide.md',
                mimeType: 'text/markdown'
            })
        ]);
        expect(store.currentConversation?.messages[0]?.requestSnapshot).toEqual({
            prompt: '当前文档已作为附件提供：/docs/guide.md\n\n请比较 @appendix.md\n\n[引用文件: appendix.md]\n# Appendix',
            attachments: [
                expect.objectContaining({
                    id: 'active-document:/docs/guide.md',
                    name: 'guide.md',
                    mimeType: 'text/markdown',
                    base64Data: encodeTextDocument('# Guide')
                })
            ],
            activeDocumentMode: 'attachment'
        });
        expect(store.currentConversation?.documentPaths).toEqual(['/docs/guide.md', '/docs/appendix.md']);
    });

    it('injects mentioned file sections on later turns without auto-attaching the current document again', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const contextProvider = createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' },
                { path: '/docs/appendix.md', name: 'appendix.md', kind: 'file', parentPath: '/docs' }
            ],
            documents: {
                '/docs/guide.md': '# Guide',
                '/docs/appendix.md': '# Appendix'
            }
        });
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);

        store.setActiveAgentContext({
            ...scopedAgent,
            modelProviderName: undefined,
            modelName: undefined
        });
        store.setWorkspaceContext({
            activeAgentKey: '/docs/.agent.json',
            selectedNodePath: '/docs/guide.md',
            activePath: '/docs/guide.md',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Guide')
            },
            contextProvider
        });

        await store.sendMessage('第一轮');
        await store.sendMessage('第二轮请结合 @appendix.md');

        expect(provider.promptsUsed[1]).toBe('第二轮请结合 @appendix.md\n\n[引用文件: appendix.md]\n# Appendix');
        expect(provider.optionsUsed[1]?.attachments).toEqual([]);
        expect(store.currentConversation?.messages[2]?.requestSnapshot).toEqual({
            prompt: '第二轮请结合 @appendix.md\n\n[引用文件: appendix.md]\n# Appendix',
            attachments: [],
            activeDocumentMode: 'none'
        });
        expect(store.currentConversation?.documentPaths).toEqual(['/docs/guide.md', '/docs/appendix.md']);
    });

    it('resolves mentioned files by unique path suffix when basenames collide', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const contextProvider = createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/docs/reference', name: 'reference', kind: 'directory', parentPath: '/docs' },
                { path: '/archive', name: 'archive', kind: 'directory' },
                { path: '/docs/reference/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs/reference' },
                { path: '/archive/guide.md', name: 'guide.md', kind: 'file', parentPath: '/archive' }
            ],
            documents: {
                '/docs/reference/guide.md': '# Docs Guide',
                '/archive/guide.md': '# Archive Guide'
            }
        });
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);
        store.setWorkspaceContext({
            activePath: '/docs/reference/guide.md',
            activeDocument: null,
            contextProvider
        });

        await store.sendMessage('请阅读 @docs/reference/guide.md');

        expect(provider.promptsUsed[0]).toBe('请阅读 @docs/reference/guide.md\n\n[引用文件: guide.md]\n# Docs Guide');
        expect(store.currentConversation?.documentPaths).toEqual(['/docs/reference/guide.md']);
    });

    it('uses the default active Agent context to resolve mentioned files before considering workspace-wide duplicates', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const contextProvider = createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/archive', name: 'archive', kind: 'directory' },
                { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' },
                { path: '/archive/guide.md', name: 'guide.md', kind: 'file', parentPath: '/archive' }
            ],
            agentConfigs: {
                '/docs/': scopedAgent,
                '/archive/': archiveAgent
            },
            documents: {
                '/docs/guide.md': '# Docs Guide',
                '/archive/guide.md': '# Archive Guide'
            }
        });
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);
        store.setActiveAgentContext({
            ...scopedAgent,
            modelProviderName: undefined,
            modelName: undefined
        });
        store.setWorkspaceContext({
            activePath: '/docs/guide.md',
            activeDocument: null,
            contextProvider
        });

        await store.sendMessage('请阅读 @guide.md');

        expect(provider.promptsUsed[0]).toBe('请阅读 @guide.md\n\n[引用文件: guide.md]\n# Docs Guide');
        expect(store.currentError).toBeNull();
        expect(store.currentConversation?.documentPaths).toEqual(['/docs/guide.md']);
    });

    it('uses the bound conversation Agent context instead of the default active Agent context when resolving mentioned files', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const archiveMentionAgent: ResolvedAgentConfig = {
            ...archiveAgent,
            modelProviderName: undefined,
            modelName: undefined
        };
        const contextProvider = createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/archive', name: 'archive', kind: 'directory' },
                { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' },
                { path: '/archive/guide.md', name: 'guide.md', kind: 'file', parentPath: '/archive' }
            ],
            agentConfigs: {
                '/docs/': scopedAgent,
                '/archive/': archiveMentionAgent
            },
            documents: {
                '/docs/guide.md': '# Docs Guide',
                '/archive/guide.md': '# Archive Guide'
            }
        });
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);
        store.setActiveAgentContext({
            ...scopedAgent,
            modelProviderName: undefined,
            modelName: undefined
        });
        store.setWorkspaceContext({
            activeAgentKey: '/docs/.agent.json',
            activePath: '/docs/guide.md',
            activeDocument: null,
            contextProvider
        });
        store.setConversationExecutionContext({
            contextProvider
        });
        store.currentConversation = {
            id: 'conversation-archive-scope',
            title: 'Archive scoped chat',
            origin: 'local',
            agentKey: '/archive/',
            messages: [],
            updatedAt: Date.now()
        };

        await store.sendMessage('请阅读 @guide.md');

        expect(provider.promptsUsed[0]).toBe('请阅读 @guide.md\n\n[引用文件: guide.md]\n# Archive Guide');
        expect(store.currentError).toBeNull();
        expect(store.currentConversation?.documentPaths).toEqual(['/archive/guide.md']);
    });

    it('surfaces an error when a mentioned file is ambiguous inside the current Agent context', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const contextProvider = createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/docs/reference', name: 'reference', kind: 'directory', parentPath: '/docs' },
                { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' },
                { path: '/docs/reference/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs/reference' },
                { path: '/archive', name: 'archive', kind: 'directory' },
                { path: '/archive/guide.md', name: 'guide.md', kind: 'file', parentPath: '/archive' }
            ],
            documents: {
                '/docs/guide.md': '# Docs Guide',
                '/docs/reference/guide.md': '# Docs Reference Guide',
                '/archive/guide.md': '# Archive Guide'
            }
        });
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);
        store.setActiveAgentContext({
            ...scopedAgent,
            modelProviderName: undefined,
            modelName: undefined
        });
        store.setWorkspaceContext({
            activePath: '/docs/guide.md',
            activeDocument: null,
            contextProvider
        });

        await store.sendMessage('请阅读 @guide.md');

        expect(provider.promptsUsed).toEqual([]);
        expect(store.currentError).toBe(
            "Referenced file '@guide.md' matches multiple files in the current Agent context. Please use a more specific path suffix."
        );
    });

    it('surfaces an error when a mentioned file resolves to a non-text document', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const contextProvider = createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/docs/spec.pdf', name: 'spec.pdf', kind: 'file', parentPath: '/docs' }
            ],
            documents: {
                '/docs/spec.pdf': {
                    mimeType: 'application/pdf',
                    dataBase64: 'JVBERi0xLjQ='
                }
            }
        });
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);
        store.setWorkspaceContext({
            activePath: '/docs/spec.pdf',
            activeDocument: null,
            contextProvider
        });

        await store.sendMessage('请阅读 @spec.pdf');

        expect(provider.promptsUsed).toEqual([]);
        expect(store.currentError).toBe(
            "Referenced file '@spec.pdf' is not a text document and cannot be injected into the prompt."
        );
    });

    it('treats @MemberName as a group mention (not a file ref) so it is excluded from file resolution', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const contextProvider = createMockContextProvider({
            nodes: [
                { path: '/docs', name: 'docs', kind: 'directory' },
                { path: '/docs/guide.md', name: 'guide.md', kind: 'file', parentPath: '/docs' }
            ],
            documents: {
                '/docs/guide.md': '# Docs Guide'
            }
        });
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);
        store.setWorkspaceContext({
            activePath: '/docs/guide.md',
            activeDocument: null,
            contextProvider
        });

        // 非 group：不排除任何 @token。
        expect(store.resolveActiveGroupMentionNames()).toEqual(new Set());

        // 切到 group：排除全部候选成员名（ChatGPT + Gemini + Claude），含未勾选项。
        store.currentProviderId = 'group';
        store.currentModelId = 'dom';
        const excluded = store.resolveActiveGroupMentionNames();
        expect(excluded).toEqual(new Set(['chatgpt', 'gemini', 'claude']));

        // 成员定向 @ChatGPT 不会被当作不存在的文件去解析（不抛错、不注入文件）。
        await expect(
            store.resolveMentionedContextDocuments('@ChatGPT 帮我看下', { excludedRefs: excluded })
        ).resolves.toEqual([]);

        // 真实文件引用 @guide.md（非成员名）仍正常解析。
        const resolved = await store.resolveMentionedContextDocuments('请阅读 @guide.md', { excludedRefs: excluded });
        expect(resolved.map((file) => file.path)).toEqual(['/docs/guide.md']);
    });

    it('group: toggles members from the candidate pool, keeps >=1, and persists the selection', async () => {
        const store = useChatStore();
        // 候选池来自 config 与 availableProviders 的交集：直接注入三个 DOM provider。
        store.availableProviders = [
            { id: 'chatgpt-dom' },
            { id: 'gemini-dom' },
            { id: 'claude-dom' }
        ] as unknown as typeof store.availableProviders;
        store.currentProviderId = 'group';
        store.currentModelId = 'dom';
        store.currentConversation = {
            id: 'group-conv',
            title: 'Group chat',
            origin: 'local',
            messages: [],
            updatedAt: 1
        } as unknown as typeof store.currentConversation;

        // 候选池含未勾选的 Claude。
        expect(store.groupCandidateMembers.map((m) => m.providerId)).toEqual([
            'chatgpt-dom',
            'gemini-dom',
            'claude-dom'
        ]);

        // 默认勾选 = dom 预设（ChatGPT + Gemini）。
        store.ensureGroupMembersInitialized();
        expect(store.currentGroupMembers.map((m) => m.name)).toEqual(['ChatGPT', 'Gemini']);

        // 勾选 Claude：按候选顺序追加。
        store.toggleGroupMember('claude-dom');
        expect(store.currentGroupMembers.map((m) => m.name)).toEqual(['ChatGPT', 'Gemini', 'Claude']);
        expect(store.currentConversation?.modelSelection?.groupMembers?.map((m) => m.name))
            .toEqual(['ChatGPT', 'Gemini', 'Claude']);

        // 取消 ChatGPT：保持候选顺序。
        store.toggleGroupMember('chatgpt-dom');
        expect(store.currentGroupMembers.map((m) => m.name)).toEqual(['Gemini', 'Claude']);

        // 减到 1 个后再取消无效（至少保留 1 个）。
        store.toggleGroupMember('claude-dom');
        expect(store.currentGroupMembers.map((m) => m.name)).toEqual(['Gemini']);
        store.toggleGroupMember('gemini-dom');
        expect(store.currentGroupMembers.map((m) => m.name)).toEqual(['Gemini']);
    });

    it('group: restores persisted member selection on conversation load', async () => {
        const store = useChatStore();
        store.availableProviders = [
            { id: 'chatgpt-dom' },
            { id: 'gemini-dom' },
            { id: 'claude-dom' }
        ] as unknown as typeof store.availableProviders;
        store.currentProviderId = 'group';
        store.currentModelId = 'dom';
        store.currentConversation = {
            id: 'group-conv',
            title: 'Group chat',
            origin: 'local',
            messages: [],
            updatedAt: 1,
            modelSelection: {
                providerId: 'group',
                modelId: 'dom',
                modelOptions: {},
                groupMembers: [
                    { providerId: 'gemini-dom', modelId: 'dom', name: 'Gemini' },
                    { providerId: 'claude-dom', modelId: 'dom', name: 'Claude' }
                ]
            }
        } as unknown as typeof store.currentConversation;

        store.ensureGroupMembersInitialized();
        // 从持久化恢复（过滤为候选并按候选顺序归一）。
        expect(store.currentGroupMembers.map((m) => m.name)).toEqual(['Gemini', 'Claude']);
    });

    it('group: reopening a conversation restores the persisted (non-default) member selection into currentGroupMembers', async () => {
        // 回归用例：此前 setCurrentModelProvider 内先 applyCurrentModelState（触发 sync，
        // 用当时还是空的 currentGroupMembers 覆盖了持久化的 groupMembers），再调用
        // ensureGroupMembersInitialized 时已读不到持久化成员，静默回退到默认预设
        // （ChatGPT + Gemini），丢失用户之前勾选的 Claude / 取消勾选的 ChatGPT。
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([
            {
                id: 'group-custom-conv',
                title: 'Group chat',
                origin: 'local',
                updatedAt: 1,
                messages: [],
                modelSelection: {
                    providerId: 'group',
                    modelId: 'dom',
                    modelOptions: {},
                    reasoningEffort: 'high',
                    explicit: true,
                    groupMembers: [
                        { providerId: 'gemini-dom', modelId: 'dom', name: 'Gemini' },
                        { providerId: 'claude-dom', modelId: 'dom', name: 'Claude' }
                    ]
                }
            } as unknown as Conversation
        ]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog([
            ...providerCatalog,
            {
                id: 'group',
                name: 'Group',
                models: [{ id: 'dom', name: 'DOM Team' }],
                defaultModel: 'dom',
                supportedRuntimeModes: ['web']
            }
        ]);
        store.availableProviders = [
            {
                id: 'group',
                name: 'Group',
                models: [{ id: 'dom', name: 'DOM Team' }],
                defaultModel: 'dom',
                supportedRuntimeModes: ['web']
            },
            { id: 'chatgpt-dom' },
            { id: 'gemini-dom' },
            { id: 'claude-dom' }
        ] as unknown as typeof store.availableProviders;

        await store.selectLocalConversation('group-custom-conv');

        expect(store.currentProviderId).toBe('group');
        // 持久化的是 [Gemini, Claude]（不含默认预设的 ChatGPT），不应回退到默认预设 [ChatGPT, Gemini]。
        expect(store.currentGroupMembers.map((m) => m.providerId)).toEqual(['gemini-dom', 'claude-dom']);
    });

    it('applies and groups local conversations by agentKey without overwriting an existing binding', async () => {
        const store = useChatStore();
        const conversation: Conversation = {
            id: 'conversation-1',
            title: 'Archive notes',
            origin: 'local',
            messages: [],
            updatedAt: 100
        };

        store.applyConversationAgentKey(conversation, '/workspace/archive/.agent.json');
        expect(conversation.agentKey).toBe('/workspace/archive/');

        store.applyConversationAgentKey(conversation, '/workspace/.agent.json');
        expect(conversation.agentKey).toBe('/workspace/archive/');

        store.conversations = [
            conversation,
            {
                id: 'conversation-2',
                title: 'Workspace notes',
                origin: 'local',
                agentKey: '/workspace/',
                messages: [],
                updatedAt: 101
            },
            {
                id: 'conversation-3',
                title: 'Normal chat',
                origin: 'local',
                messages: [],
                updatedAt: 102
            }
        ];

        expect(store.getConversationsByAgent('/workspace/archive/.agent.json').map((item) => item.id)).toEqual(['conversation-1']);
        expect(store.resolveConversationAgentKey('')).toBeUndefined();
        expect(store.resolveConversationAgentKey('/workspace/.agent.json')).toBe('/workspace/');
        expect(store.resolveConversationAgentKey('/workspace/docs')).toBe('/workspace/docs/');
    });

    it('binds, rebinds, and unbinds local conversations while keeping the active conversation in sync', async () => {
        const storage = new MockStorageProvider([
            {
                id: 'conversation-1',
                title: 'Archive notes',
                origin: 'local',
                messages: [],
                updatedAt: 100
            }
        ]);
        const store = useChatStore();
        store.setProviders(new MockModelProvider(), storage);
        await store.init();

        store.currentConversation = {
            id: 'conversation-1',
            title: 'Archive notes',
            origin: 'local',
            messages: [],
            updatedAt: 100
        };

        await store.bindConversationToAgent('conversation-1', '/workspace/archive/.agent.json');
        expect(storage['conversations'][0]).toMatchObject({
            id: 'conversation-1',
            agentKey: '/workspace/archive/',
            updatedAt: expect.any(Number)
        });
        expect(storage.syncNowCalls).toBe(1);
        expect(store.currentConversation?.agentKey).toBe('/workspace/archive/');
        expect(store.getConversationsByAgent('/workspace/archive/.agent.json').map((item) => item.id)).toEqual(['conversation-1']);

        await store.bindConversationToAgent('conversation-1', '/workspace/.agent.json');
        expect(storage['conversations'][0]).toMatchObject({
            id: 'conversation-1',
            agentKey: '/workspace/',
            updatedAt: expect.any(Number)
        });
        expect(storage.syncNowCalls).toBe(2);
        expect(store.currentConversation?.agentKey).toBe('/workspace/');
        expect(store.getConversationsByAgent('/workspace/.agent.json').map((item) => item.id)).toEqual(['conversation-1']);

        await store.bindConversationToAgent('conversation-1', null);
        expect(storage['conversations'][0]).toMatchObject({
            id: 'conversation-1',
            updatedAt: expect.any(Number)
        });
        expect(storage.syncNowCalls).toBe(3);
        expect(storage['conversations'][0].agentKey).toBeUndefined();
        expect(store.currentConversation?.agentKey).toBeUndefined();
        expect(store.getConversationsByAgent('/workspace/.agent.json').map((item) => item.id)).toEqual([]);
    });

    it('restores the bound agent context when selecting an existing local conversation', async () => {
        const storage = new MockStorageProvider([
            {
                id: 'conversation-bound',
                title: 'Bound conversation',
                origin: 'local',
                agentKey: '/docs/',
                updatedAt: 100,
                messages: []
            }
        ]);
        const store = useChatStore();
        store.setProviders(new MockModelProvider(), storage);
        const conversationContextProvider = createConversationContextProvider({
            nodes: [],
            agentConfigs: {
                '/docs/': scopedAgent,
                '/archive/': archiveAgent
            }
        });
        store.setConversationExecutionContext({
            contextProvider: conversationContextProvider,
            onFileChanged: null
        });
        store.setActiveAgentContext(archiveAgent);

        await store.init();
        await store.selectLocalConversation('conversation-bound');

        expect(store.activeAgentContext).toEqual(expect.objectContaining({
            name: 'Docs Agent',
            tools: expect.arrayContaining([
                { id: 'read_document', description: 'Read docs' }
            ])
        }));
    });

    it('includes the active local conversation in agent grouping before persistence refresh completes', async () => {
        const store = useChatStore();
        store.conversations = [
            {
                id: 'conversation-1',
                title: 'Archive notes',
                origin: 'local',
                agentKey: '/workspace/archive/',
                messages: [],
                updatedAt: 100
            }
        ];
        store.currentConversation = {
            id: 'conversation-active',
            title: 'Docs owner conversation',
            origin: 'local',
            agentKey: '/workspace/docs',
            messages: [],
            updatedAt: 101
        };

        expect(store.getConversationsByAgent('/workspace/docs/.agent.json').map((item) => item.id)).toEqual(['conversation-active']);
        expect(store.getConversationsByAgent('/workspace/archive/.agent.json').map((item) => item.id)).toEqual(['conversation-1']);
    });

    it('attaches active pdf documents when the provider accepts application/pdf', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);
        store.setWorkspaceMode('agent');

        store.setActiveAgentContext({
            ...scopedAgent,
            modelProviderName: undefined,
            modelName: undefined
        });
        store.setWorkspaceContext({
            activePath: '/docs/spec.pdf',
            activeDocument: {
                path: '/docs/spec.pdf',
                mimeType: 'application/pdf',
                dataBase64: 'JVBERi0xLjQ='
            },
            contextProvider: null
        });
        await store.sendMessage('请总结这个 PDF');

        expect(provider.promptsUsed[0]).toBe('请总结这个 PDF');
        expect(provider.optionsUsed[0]?.attachments).toEqual([
            expect.objectContaining({
                id: 'active-document:/docs/spec.pdf',
                name: 'spec.pdf',
                mimeType: 'application/pdf',
                base64Data: 'JVBERi0xLjQ='
            })
        ]);
        expect(store.currentConversation?.messages[0]?.attachments).toEqual([
            expect.objectContaining({
                id: 'active-document:/docs/spec.pdf',
                name: 'spec.pdf',
                mimeType: 'application/pdf',
                base64Data: 'JVBERi0xLjQ='
            })
        ]);
        expect(store.currentConversation?.messages[0]?.requestSnapshot).toEqual({
            prompt: '请总结这个 PDF',
            attachments: [
                expect.objectContaining({
                    id: 'active-document:/docs/spec.pdf',
                    name: 'spec.pdf',
                    mimeType: 'application/pdf',
                    base64Data: 'JVBERi0xLjQ='
                })
            ],
            activeDocumentMode: 'attachment'
        });
        expect(store.currentConversation?.documentPaths).toEqual(['/docs/spec.pdf']);
    });

    it('omits active document payloads when the provider does not accept the current mime type', async () => {
        const provider = new MockModelProvider();
        provider.acceptedMimeTypes = ['text/plain', 'text/markdown'];
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);
        store.setWorkspaceMode('agent');

        store.setActiveAgentContext({
            ...scopedAgent,
            modelProviderName: undefined,
            modelName: undefined
        });
        store.setWorkspaceContext({
            activePath: '/docs/spec.pdf',
            activeDocument: {
                path: '/docs/spec.pdf',
                mimeType: 'application/pdf',
                dataBase64: 'JVBERi0xLjQ='
            },
            contextProvider: null
        });
        await store.sendMessage('请总结这个 PDF');

        expect(provider.promptsUsed[0]).toBe('请总结这个 PDF');
        expect(provider.optionsUsed[0]?.attachments).toEqual([]);
        expect(store.currentConversation?.messages[0]?.requestSnapshot).toEqual({
            prompt: '请总结这个 PDF',
            attachments: [],
            activeDocumentMode: 'omitted'
        });
        expect(store.currentConversation?.documentPaths).toEqual(['/docs/spec.pdf']);
    });

    it('keeps the first-turn document binding when later turns switch to another document', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);

        store.setActiveAgentContext({
            ...scopedAgent,
            modelProviderName: undefined,
            modelName: undefined
        });
        store.setWorkspaceContext({
            activePath: '/docs/guide.md',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Guide')
            },
            contextProvider: null
        });
        await store.sendMessage('第一轮');

        store.setWorkspaceContext({
            activePath: '/docs/appendix.md',
            activeDocument: {
                path: '/docs/appendix.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Appendix')
            },
            contextProvider: null
        });
        await store.sendMessage('第二轮');

        expect(store.currentConversation?.documentPaths).toEqual(['/docs/guide.md']);
    });

    it('keeps the prepared active document attachment visible when agent model resolution fails before send', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);
        store.setWorkspaceMode('agent');

        store.setActiveAgentContext({
            ...scopedAgent,
            modelProviderName: 'mock-provider',
            modelName: 'missing-model'
        });
        store.setWorkspaceContext({
            activePath: '/docs/guide.md',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Guide')
            },
            contextProvider: null
        });

        await store.sendMessage('请分析当前文档');

        expect(store.currentError).toBe("Agent model 'missing-model' is unavailable for provider 'mock-provider'.");
        expect(provider.promptsUsed).toHaveLength(0);
        expect(store.currentConversation?.messages[0]).toMatchObject({
            role: 'user',
            content: '当前文档已作为附件提供：/docs/guide.md\n\n请分析当前文档'
        });
        expect(store.currentConversation?.messages[0]?.attachments).toEqual([
            expect.objectContaining({
                id: 'active-document:/docs/guide.md',
                name: 'guide.md',
                mimeType: 'text/markdown',
                base64Data: encodeTextDocument('# Guide')
            })
        ]);
        expect(store.currentConversation?.messages[0]?.requestSnapshot).toEqual({
            prompt: '当前文档已作为附件提供：/docs/guide.md\n\n请分析当前文档',
            attachments: [
                expect.objectContaining({
                    id: 'active-document:/docs/guide.md',
                    name: 'guide.md',
                    mimeType: 'text/markdown',
                    base64Data: encodeTextDocument('# Guide')
                })
            ],
            activeDocumentMode: 'attachment'
        });
    });

    it('resolves an agent model by provider model name when the configured model uses a display label', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog([
            {
                id: 'gemini-api',
                name: 'Gemini API',
                models: [
                    { id: 'gemini-pro-latest', name: 'Gemini Pro Latest' },
                    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' }
                ],
                defaultModel: 'gemini-pro-latest',
                supportedRuntimeModes: ['web']
            }
        ]);

        store.setActiveAgentContext({
            ...scopedAgent,
            modelProviderName: 'gemini-api',
            modelName: 'Gemini Pro Latest'
        });
        await store.sendMessage('请分析当前文档');

        expect(provider.optionsUsed[0]?.modelId).toBe('gemini-pro-latest');
        expect(store.currentError).toBeNull();
    });

    it('resolves Gemini Pro Latest to the concrete pro model id when only the concrete model exists', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog([
            {
                id: 'gemini-api',
                name: 'Gemini API',
                models: [
                    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
                    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' }
                ],
                defaultModel: 'gemini-2.5-pro',
                supportedRuntimeModes: ['web']
            }
        ]);

        store.setActiveAgentContext({
            ...scopedAgent,
            modelProviderName: 'gemini-api',
            modelName: 'Gemini Pro Latest'
        });
        await store.sendMessage('请分析当前文档');

        expect(provider.optionsUsed[0]?.modelId).toBe('gemini-2.5-pro');
        expect(store.currentError).toBeNull();
    });

    it('replays the first-turn pdf from persisted history instead of auto-attaching it again on follow-up turns', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);
        store.setWorkspaceMode('agent');

        store.setActiveAgentContext({
            ...scopedAgent,
            modelProviderName: undefined,
            modelName: undefined
        });
        store.setWorkspaceContext({
            activePath: '/docs/spec.pdf',
            activeDocument: {
                path: '/docs/spec.pdf',
                mimeType: 'application/pdf',
                dataBase64: 'JVBERi0xLjQ='
            },
            contextProvider: null
        });

        await store.sendMessage('第一轮总结这个 PDF');
        await store.sendMessage('第二轮继续问');

        expect(provider.optionsUsed[0]?.attachments).toEqual([
            expect.objectContaining({
                id: 'active-document:/docs/spec.pdf',
                name: 'spec.pdf',
                mimeType: 'application/pdf'
            })
        ]);
        expect(provider.optionsUsed[1]?.attachments).toEqual([]);
        expect(provider.optionsUsed[1]?.history).toEqual([
            {
                role: 'user',
                content: '第一轮总结这个 PDF',
                attachments: [
                    expect.objectContaining({
                        id: 'active-document:/docs/spec.pdf',
                        name: 'spec.pdf',
                        mimeType: 'application/pdf'
                    })
                ]
            },
            {
                role: 'assistant',
                content: 'reply:第一轮总结这个 PDF',
                attachments: undefined
            }
        ]);
        expect(store.currentConversation?.messages[2]?.attachments).toBeUndefined();
        expect(store.currentConversation?.messages[2]?.requestSnapshot).toEqual({
            prompt: '第二轮继续问',
            attachments: [],
            activeDocumentMode: 'none'
        });
    });

    it('passes the current agent context into AgentRuntime when available', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        const run = vi.fn(async (
            request: Record<string, unknown>,
            onUpdate: (update: { text: string; functionalParts?: Conversation['messages'][number]['functionalParts'] }) => void
        ) => {
            const functionalParts = [
                {
                    id: 'agent-part-1',
                    kind: 'tool_result' as const,
                    title: 'Workspace read',
                    content: '# Guide'
                }
            ];
            onUpdate({ text: 'agent-runtime:done', functionalParts });
            return {
                text: 'agent-runtime:done',
                conversationId: 'runtime-conversation',
                messageId: 'runtime-message',
                functionalParts,
                requestSnapshot: {
                    prompt: String(request.prompt),
                    attachments: request.workspace
                        && typeof request.workspace === 'object'
                        && 'activeDocument' in request.workspace
                        && (request.workspace as { activeDocument?: unknown }).activeDocument
                        ? [
                            {
                                id: 'active-document:/docs/guide.md',
                                type: 'file' as const,
                                name: 'guide.md',
                                mimeType: 'text/markdown',
                                size: 7,
                                base64Data: encodeTextDocument('# Guide')
                            }
                        ]
                        : [],
                    activeDocumentMode: request.workspace
                        && typeof request.workspace === 'object'
                        && 'activeDocument' in request.workspace
                        && (request.workspace as { activeDocument?: unknown }).activeDocument
                        ? 'attachment'
                        : 'none'
                }
            };
        });
        store.setProviders(provider, storage);
        store.setAgentRuntime({
            run,
            abort: vi.fn()
        });
        store.setModelProviderResolver((providerId: string) => {
            provider.id = providerId;
            return provider;
        });
        store.setProviderModelsResolver(async (providerId: string) => {
            if (providerId === 'other-provider') {
                return {
                    models: [{ id: 'other-dynamic', name: 'Other Dynamic' }],
                    defaultModel: 'other-dynamic'
                };
            }

            return {
                models: [{ id: 'dynamic-model', name: 'Dynamic Model', options: chatgptOptionDefinitions }],
                defaultModel: 'dynamic-model'
            };
        });

        await store.initializeProviderCatalog(providerCatalog);
        store.setWorkspaceMode('agent');
        store.setActiveAgentContext({
            ...scopedAgent,
            modelProviderName: 'other-provider',
            modelName: 'other-dynamic'
        });
        store.setWorkspaceContext({
            activePath: '/docs/guide.md',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Guide')
            },
            contextProvider: {
                id: 'workspace-context',
                initializeAccess: vi.fn(async () => undefined),
                getContext: vi.fn(async () => ({ nodes: [], agentConfigs: {} })),
                getConversations: vi.fn(async () => []),
                getProjectDocuments: vi.fn(async () => []),
                readDocument: vi.fn(async (path: string) => ({ path, mimeType: 'text/markdown', dataBase64: encodeTextDocument('# Guide') })),
                writeDocument: vi.fn(async () => ({})),
                createNode: vi.fn(async () => ({ path: '/docs/draft.md', name: 'draft.md', kind: 'file' as const, agentKey: '/docs/' })),
                deleteNode: vi.fn(async () => undefined),
                renameNode: vi.fn(async () => ({ path: '/docs/renamed.md', name: 'renamed.md', kind: 'file' as const, agentKey: '/docs/' })),
                searchInScope: vi.fn(async () => []),
                resolveScopedAgentConfig: vi.fn(async () => scopedAgent)
            },
            onFileChanged: vi.fn(async () => undefined)
        });

        await store.startNewConversation({
            boundNodeName: 'guide.md',
            agentKey: '/docs/.agent.json',
            documentPath: '/docs/guide.md',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Guide')
            }
        });

        await store.sendMessage('让 runtime 发送');

        expect(provider.promptsUsed).toHaveLength(0);
        expect(run).toHaveBeenCalledTimes(1);
        expect(run.mock.calls[0]?.[0]).toMatchObject({
            prompt: `当前文档已作为附件提供：/docs/guide.md\n\n让 runtime 发送`,
            agent: expect.objectContaining({
                name: 'Docs Agent',
                modelProviderName: 'other-provider',
                modelName: 'other-dynamic'
            }),
            workspace: {
                activePath: '/docs/guide.md',
                activeDocument: {
                    path: '/docs/guide.md',
                    mimeType: 'text/markdown',
                    dataBase64: encodeTextDocument('# Guide')
                },
                contextProvider: expect.objectContaining({ id: 'workspace-context' }),
                onFileChanged: expect.any(Function)
            },
            providerId: 'other-provider',
            modelId: 'other-dynamic',
            attachments: [
                {
                    id: 'active-document:/docs/guide.md',
                    type: 'file',
                    name: 'guide.md',
                    mimeType: 'text/markdown',
                    size: 7,
                    base64Data: encodeTextDocument('# Guide')
                }
            ],
            modelOptions: {}
        });
        expect(store.currentConversation?.messages[1]?.content).toBe('agent-runtime:done');
        expect(store.currentConversation?.messages[1]?.functionalParts).toEqual([
            {
                id: 'agent-part-1',
                kind: 'tool_result',
                title: 'Workspace read',
                content: '# Guide'
            }
        ]);
        expect(store.currentConversation?.backendId).toBe('runtime-conversation');
        expect(store.currentConversation?.messages[0]?.requestSnapshot).toEqual({
            prompt: `当前文档已作为附件提供：/docs/guide.md\n\n让 runtime 发送`,
            attachments: [
                {
                    id: 'active-document:/docs/guide.md',
                    type: 'file',
                    name: 'guide.md',
                    mimeType: 'text/markdown',
                    size: 7,
                    base64Data: encodeTextDocument('# Guide')
                }
            ],
            activeDocumentMode: 'attachment'
        });

        await store.sendMessage('第二轮 runtime');

        expect(run).toHaveBeenCalledTimes(2);
        expect(run.mock.calls[1]?.[0]).toMatchObject({
            prompt: '第二轮 runtime',
            workspace: {
                activePath: '/docs/guide.md',
                activeDocument: null
            },
            history: [
                {
                    role: 'user',
                    content: '当前文档已作为附件提供：/docs/guide.md\n\n让 runtime 发送',
                    attachments: [
                        {
                            id: 'active-document:/docs/guide.md',
                            type: 'file',
                            name: 'guide.md',
                            mimeType: 'text/markdown',
                            size: 7,
                            base64Data: encodeTextDocument('# Guide')
                        }
                    ]
                },
                {
                    role: 'assistant',
                    content: 'agent-runtime:done',
                    attachments: undefined
                }
            ]
        });
        expect(store.currentConversation?.messages[2]?.requestSnapshot).toEqual({
            prompt: '第二轮 runtime',
            attachments: [],
            activeDocumentMode: 'none'
        });
        expect(store.currentConversation?.messages[2]?.attachments).toBeUndefined();
    });

    it('ignores unexpected runtime attachment echoes on later turns', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        const run = vi.fn(async (
            request: Record<string, unknown>,
            onUpdate: (update: { text: string }) => void
        ) => {
            onUpdate({ text: 'agent-runtime:echo' });
            const hasActiveDocument = !!(
                request.workspace
                && typeof request.workspace === 'object'
                && 'activeDocument' in request.workspace
                && (request.workspace as { activeDocument?: unknown }).activeDocument
            );
            return {
                text: 'agent-runtime:echo',
                conversationId: 'runtime-conversation',
                messageId: 'runtime-message',
                requestSnapshot: {
                    prompt: String(request.prompt),
                    attachments: hasActiveDocument
                        ? [
                            {
                                id: 'active-document:/docs/spec.pdf',
                                type: 'file' as const,
                                name: 'spec.pdf',
                                mimeType: 'application/pdf',
                                size: 18,
                                base64Data: 'JVBERi0xLjQ='
                            }
                        ]
                        : [
                            {
                                id: 'active-document:/docs/spec.pdf',
                                type: 'file' as const,
                                name: 'spec.pdf',
                                mimeType: 'application/pdf',
                                size: 18,
                                base64Data: 'JVBERi0xLjQ='
                            }
                        ],
                    activeDocumentMode: hasActiveDocument ? 'attachment' : 'none'
                }
            };
        });

        store.setProviders(provider, storage);
        store.setAgentRuntime({
            run,
            abort: vi.fn()
        });
        store.setModelProviderResolver((providerId: string) => {
            provider.id = providerId;
            return provider;
        });
        store.setProviderModelsResolver(async () => ({
            models: [{ id: 'dynamic-model', name: 'Dynamic Model', options: geminiOptionDefinitions }],
            defaultModel: 'dynamic-model'
        }));

        await store.initializeProviderCatalog(providerCatalog);
        store.setWorkspaceMode('agent');
        store.setActiveAgentContext({
            ...scopedAgent,
            modelProviderName: 'gemini-api',
            modelName: 'dynamic-model'
        });
        store.setWorkspaceContext({
            activePath: '/docs/spec.pdf',
            activeDocument: {
                path: '/docs/spec.pdf',
                mimeType: 'application/pdf',
                dataBase64: 'JVBERi0xLjQ='
            },
            contextProvider: null
        });

        await store.sendMessage('第一轮总结这个 PDF');
        await store.sendMessage('第二轮继续问');

        expect(store.currentConversation?.messages[0]?.requestSnapshot).toEqual({
            prompt: '第一轮总结这个 PDF',
            attachments: [
                {
                    id: 'active-document:/docs/spec.pdf',
                    type: 'file',
                    name: 'spec.pdf',
                    mimeType: 'application/pdf',
                    size: 8,
                    base64Data: 'JVBERi0xLjQ='
                }
            ],
            activeDocumentMode: 'attachment'
        });
        expect(store.currentConversation?.messages[2]?.requestSnapshot).toEqual({
            prompt: '第二轮继续问',
            attachments: [],
            activeDocumentMode: 'none'
        });
        expect(store.currentConversation?.messages[2]?.attachments).toBeUndefined();
    });

    it('persists archived runtime conversations with follow-up turns across reload', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([
            {
                id: 'runtime-archive-conversation',
                title: 'Archive conversation',
                origin: 'local',
                updatedAt: 1,
                archive: {
                    documentPath: '/docs/archive.md',
                    documentId: 'doc-archive',
                    archivedAt: 10,
                    sourceMessageCount: 2
                },
                messages: [
                    {
                        id: 'user-1',
                        role: 'user',
                        content: 'Playwright archive prompt',
                        questionId: 'q-1',
                        createdAt: 1
                    },
                    {
                        id: 'assistant-1',
                        role: 'assistant',
                        content: 'reply:Playwright archive prompt',
                        questionId: 'q-1',
                        createdAt: 2
                    }
                ]
            }
        ]);
        const store = useChatStore();
        const run = vi.fn(async (
            request: Record<string, unknown>,
            onUpdate: (update: { text: string }) => void
        ) => {
            onUpdate({ text: 'agent-runtime:archive-follow-up' });
            return {
                text: 'agent-runtime:archive-follow-up',
                conversationId: 'runtime-archive-backend',
                messageId: 'runtime-archive-message',
                requestSnapshot: {
                    prompt: String(request.prompt),
                    attachments: [],
                    activeDocumentMode: 'none'
                }
            };
        });

        store.setProviders(provider, storage);
        store.setAgentRuntime({
            run,
            abort: vi.fn()
        });
        store.setModelProviderResolver((providerId: string) => {
            provider.id = providerId;
            return provider;
        });
        store.setProviderModelsResolver(async () => ({
            models: [{ id: 'dynamic-model', name: 'Dynamic Model', options: geminiOptionDefinitions }],
            defaultModel: 'dynamic-model'
        }));

        await store.initializeProviderCatalog(providerCatalog);
        store.setWorkspaceMode('agent');
        store.setActiveAgentContext({
            ...scopedAgent,
            modelProviderName: 'gemini-api',
            modelName: 'dynamic-model'
        });
        store.setWorkspaceContext({
            selectedNodePath: '/docs/archive.md',
            activePath: '/docs/archive.md',
            activeDocument: {
                path: '/docs/archive.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Archive Seed'),
                documentId: 'doc-archive'
            },
            contextProvider: null,
            onFileChanged: vi.fn(async () => undefined)
        });
        await store.loadConversation('runtime-archive-conversation');

        store.setDraftPrompt('Playwright archive follow-up');
        await store.sendDraft();

        const persistedConversation = await storage.getConversation('runtime-archive-conversation');
        expect(persistedConversation).toMatchObject({
            id: 'runtime-archive-conversation',
            archive: {
                documentPath: '/docs/archive.md',
                documentId: 'doc-archive',
                sourceMessageCount: 2
            }
        });
        expect(persistedConversation?.messages.map((message) => message.content)).toContain('Playwright archive follow-up');
        expect(persistedConversation?.messages.map((message) => message.content)).toContain('agent-runtime:archive-follow-up');
    });

    it('prefers the existing conversation agent binding over the currently selected workspace agent when sending', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        const run = vi.fn(async (
            request: Record<string, unknown>,
            onUpdate: (update: { text: string }) => void
        ) => {
            onUpdate({ text: 'agent-runtime:bound-agent' });
            return {
                text: 'agent-runtime:bound-agent',
                conversationId: 'runtime-conversation',
                messageId: 'runtime-message',
                requestSnapshot: {
                    prompt: String(request.prompt),
                    attachments: [],
                    activeDocumentMode: 'none'
                }
            };
        });

        store.setProviders(provider, storage);
        store.setAgentRuntime({
            run,
            abort: vi.fn()
        });
        store.setProviderModelsResolver(async (providerId: string) => {
            if (providerId === 'other-provider') {
                return {
                    models: [{ id: 'other-static', name: 'Other Static' }],
                    defaultModel: 'other-static'
                };
            }

            return {
                models: [{ id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' }],
                defaultModel: 'gemini-2.5-pro'
            };
        });

        await store.initializeProviderCatalog(providerCatalog);
        const conversationContextProvider = createConversationContextProvider({
            nodes: [],
            agentConfigs: {
                '/docs/': scopedAgent,
                '/archive/': archiveAgent
            }
        });
        store.setConversationExecutionContext({
            contextProvider: conversationContextProvider,
            onFileChanged: null
        });
        store.setActiveAgentContext(archiveAgent);
        store.currentConversation = {
            id: 'conversation-bound-agent',
            title: 'Bound agent conversation',
            origin: 'local',
            agentKey: '/docs/',
            updatedAt: Date.now(),
            messages: [
                {
                    id: 'user-1',
                    role: 'user',
                    content: '已有历史'
                },
                {
                    id: 'assistant-1',
                    role: 'assistant',
                    content: '已有回复'
                }
            ]
        };
        store.setDraftPrompt('继续提问');

        await store.sendDraft();

        expect(run).toHaveBeenCalledTimes(1);
        expect(run.mock.calls[0]?.[0]).toMatchObject({
            agent: expect.objectContaining({
                name: 'Docs Agent',
                tools: expect.arrayContaining([
                    { id: 'read_document', description: 'Read docs' }
                ])
            }),
            workspace: expect.objectContaining({
                contextProvider: conversationContextProvider,
                onFileChanged: undefined
            }),
            providerId: 'gemini-api',
            modelId: 'gemini-2.5-pro'
        });
    });

    it('prioritizes the agent-specified provider and model during send', async () => {
        const defaultProvider = new MockModelProvider();
        const agentProvider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();

        store.setProviders(defaultProvider, storage);
        store.setModelProviderResolver((providerId: string) => {
            if (providerId === 'other-provider') {
                agentProvider.id = providerId;
                return agentProvider;
            }

            defaultProvider.id = providerId;
            return defaultProvider;
        });
        store.setProviderModelsResolver(async (providerId: string) => {
            if (providerId === 'other-provider') {
                return {
                    models: [{ id: 'other-dynamic', name: 'Other Dynamic' }],
                    defaultModel: 'other-dynamic'
                };
            }

            return {
                models: [{ id: 'dynamic-model', name: 'Dynamic Model', options: chatgptOptionDefinitions }],
                defaultModel: 'dynamic-model'
            };
        });

        await store.initializeProviderCatalog(providerCatalog);
        store.setActiveAgentContext({
            ...scopedAgent,
            modelProviderName: 'other-provider',
            modelName: 'other-dynamic'
        });
        await store.sendMessage('用 Agent 指定模型发送');

        expect(defaultProvider.promptsUsed).toHaveLength(0);
        expect(agentProvider.promptsUsed[0]).toBe('用 Agent 指定模型发送');
        expect(agentProvider.optionsUsed[0]).toMatchObject({
            modelId: 'other-dynamic',
            modelOptions: {}
        });
        expect(store.currentConversation?.modelSelection).toEqual({
            providerId: 'other-provider',
            modelId: 'other-dynamic',
            modelOptions: {},
            reasoningEffort: 'high'
        });
    });

    it('lets an explicit dropdown selection override the agent-specified model during send', async () => {
        const defaultProvider = new MockModelProvider();
        const agentProvider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();

        store.setProviders(defaultProvider, storage);
        store.setModelProviderResolver((providerId: string) => {
            if (providerId === 'other-provider') {
                agentProvider.id = providerId;
                return agentProvider;
            }

            defaultProvider.id = providerId;
            return defaultProvider;
        });
        store.setProviderModelsResolver(async (providerId: string) => {
            if (providerId === 'other-provider') {
                return {
                    models: [{ id: 'other-dynamic', name: 'Other Dynamic' }],
                    defaultModel: 'other-dynamic'
                };
            }

            return {
                models: [{ id: 'dynamic-model', name: 'Dynamic Model', options: chatgptOptionDefinitions }],
                defaultModel: 'dynamic-model'
            };
        });

        await store.initializeProviderCatalog(providerCatalog);
        // agent 指定了 other-provider，但用户在下拉框主动选了 mock-provider → 应以下拉框为准。
        store.setActiveAgentContext({
            ...scopedAgent,
            modelProviderName: 'other-provider',
            modelName: 'other-dynamic'
        });
        await store.setCurrentModelProviderByUser('mock-provider');
        await store.sendMessage('用下拉框显式选择发送');

        expect(agentProvider.promptsUsed).toHaveLength(0);
        expect(defaultProvider.promptsUsed[0]).toBe('用下拉框显式选择发送');
        expect(store.currentConversation?.modelSelection).toMatchObject({
            providerId: 'mock-provider',
            explicit: true
        });
    });

    it('clears the explicit override when an agent context selection is applied', async () => {
        const defaultProvider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();

        store.setProviders(defaultProvider, storage);
        store.setModelProviderResolver((providerId: string) => {
            defaultProvider.id = providerId;
            return defaultProvider;
        });
        store.setProviderModelsResolver(async () => ({
            models: [{ id: 'dynamic-model', name: 'Dynamic Model' }, { id: 'other-dynamic', name: 'Other Dynamic' }],
            defaultModel: 'dynamic-model'
        }));

        await store.initializeProviderCatalog(providerCatalog);
        await store.setCurrentModelProviderByUser('mock-provider', 'other-dynamic');
        expect(store.currentModelSelectionExplicit).toBe(true);

        await store.applyActiveAgentContextSelection({
            ...scopedAgent,
            modelProviderName: 'mock-provider',
            modelName: 'dynamic-model'
        });
        expect(store.currentModelSelectionExplicit).toBe(false);
    });

    it('imports external files and preserves origin metadata', async () => {
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(new MockModelProvider(), storage);
        store.setHistoryProviders([
            {
                id: 'external-file',
                label: '外部文件导入',
                kind: 'file-import'
            }
        ]);
        store.setExternalFileImportHandler(async () => ({
            id: 'file-preview',
            title: 'Imported File Chat',
            origin: 'external-file',
            externalId: 'file-1',
            backendId: 'file-1',
            updatedAt: 50,
            messages: [
                { id: 'm1', role: 'user', content: 'from file' }
            ]
        }));

        await store.setHistorySource('external');

        expect(store.historySource).toBe('local');
        expect(store.currentConversation?.title).toBe('Imported File Chat');
        expect(store.currentConversation?.origin).toBe('external-file');
        expect((await storage.getAllConversations())[0]?.origin).toBe('external-file');
    });

    it('marks external history loading while provider history is being fetched', async () => {
        let resolveHistoryList: ((value: ConversationHistorySummary[]) => void) | null = null;
        const historyProvider: IExternalConversationProvider = {
            id: 'chatgpt-web',
            getHistoryList() {
                return new Promise((resolve) => {
                    resolveHistoryList = resolve;
                });
            },
            async getHistoryDetail() {
                throw new Error('not used');
            }
        };

        const store = useChatStore();
        store.setProviders(new MockModelProvider(), new MockStorageProvider([]));
        store.setHistoryProviders([
            {
                id: 'chatgpt-web',
                label: 'ChatGPT',
                kind: 'history-provider',
                provider: historyProvider
            }
        ]);

        const pending = store.setHistorySource('external');
        expect(store.isExternalHistoryLoading).toBe(true);
        expect(store.externalHistoryItems).toEqual([]);

        resolveHistoryList?.([
            { id: 'remote-1', title: 'Remote Chat', updatedAt: 1, origin: 'chatgpt-web' }
        ]);
        await pending;

        expect(store.isExternalHistoryLoading).toBe(false);
        expect(store.externalHistoryItems).toHaveLength(1);
    });

    it('shares submitted external history query across searchable providers and reloads on provider switch', async () => {
        const chatgptHistory = new MockHistoryProvider(
            [
                { id: 'chatgpt-1', title: 'Alpha Notes', updatedAt: 2, origin: 'chatgpt-web' },
                { id: 'chatgpt-2', title: 'Incident Draft', updatedAt: 1, origin: 'chatgpt-web' }
            ],
            {
                'chatgpt-1': {
                    id: 'preview-chatgpt-1',
                    title: 'Alpha Notes',
                    origin: 'chatgpt-web',
                    externalId: 'chatgpt-1',
                    backendId: 'chatgpt-1',
                    updatedAt: 2,
                    messages: [{ id: 'm1', role: 'user', content: 'alpha' }]
                },
                'chatgpt-2': {
                    id: 'preview-chatgpt-2',
                    title: 'Incident Draft',
                    origin: 'chatgpt-web',
                    externalId: 'chatgpt-2',
                    backendId: 'chatgpt-2',
                    updatedAt: 1,
                    messages: [{ id: 'm2', role: 'assistant', content: 'incident summary' }]
                }
            }
        );
        const geminiHistory = new MockHistoryProvider(
            [
                { id: 'gemini-1', title: 'Sprint Review', updatedAt: 2, origin: 'gemini-web' },
                { id: 'gemini-2', title: 'Incident Timeline', updatedAt: 1, origin: 'gemini-web' }
            ],
            {
                'gemini-1': {
                    id: 'preview-gemini-1',
                    title: 'Sprint Review',
                    origin: 'gemini-web',
                    externalId: 'gemini-1',
                    backendId: 'gemini-1',
                    updatedAt: 2,
                    messages: [{ id: 'g1', role: 'assistant', content: 'review' }]
                },
                'gemini-2': {
                    id: 'preview-gemini-2',
                    title: 'Incident Timeline',
                    origin: 'gemini-web',
                    externalId: 'gemini-2',
                    backendId: 'gemini-2',
                    updatedAt: 1,
                    messages: [{ id: 'g2', role: 'assistant', content: 'incident timeline' }]
                }
            }
        );
        geminiHistory.id = 'gemini-web';

        const store = useChatStore();
        store.setProviders(new MockModelProvider(), new MockStorageProvider([]));
        store.setHistoryProviders([
            {
                id: 'chatgpt-web',
                label: 'ChatGPT',
                kind: 'history-provider',
                features: {
                    historySearch: true
                },
                provider: chatgptHistory
            },
            {
                id: 'gemini-web',
                label: 'Gemini',
                kind: 'history-provider',
                features: {
                    historySearch: true
                },
                provider: geminiHistory
            }
        ]);

        await store.setHistorySource('external');
        store.setExternalHistoryQuery('incident');
        await store.submitExternalHistoryQuery();

        expect(store.externalHistoryQuerySubmitted).toBe('incident');
        expect(chatgptHistory.historyListCalls.at(-1)).toEqual({ query: 'incident' });
        expect(store.externalHistoryItems.map((item) => item.id)).toEqual(['chatgpt-2']);

        await store.setActiveExternalProvider('gemini-web');

        expect(store.externalHistoryQuery).toBe('incident');
        expect(store.externalHistoryQuerySubmitted).toBe('incident');
        expect(geminiHistory.historyListCalls.at(-1)).toEqual({ query: 'incident' });
        expect(store.externalHistoryItems.map((item) => item.id)).toEqual(['gemini-2']);
    });

    it('clears the shared external history query and reloads the recent list', async () => {
        const history = new MockHistoryProvider(
            [
                { id: 'remote-1', title: 'Recent Chat', updatedAt: 2, origin: 'chatgpt-web' },
                { id: 'remote-2', title: 'Incident Analysis', updatedAt: 1, origin: 'chatgpt-web' }
            ],
            {
                'remote-1': {
                    id: 'preview-1',
                    title: 'Recent Chat',
                    origin: 'chatgpt-web',
                    externalId: 'remote-1',
                    backendId: 'remote-1',
                    updatedAt: 2,
                    messages: [{ id: 'm1', role: 'user', content: 'recent' }]
                },
                'remote-2': {
                    id: 'preview-2',
                    title: 'Incident Analysis',
                    origin: 'chatgpt-web',
                    externalId: 'remote-2',
                    backendId: 'remote-2',
                    updatedAt: 1,
                    messages: [{ id: 'm2', role: 'assistant', content: 'incident details' }]
                }
            }
        );

        const store = useChatStore();
        store.setProviders(new MockModelProvider(), new MockStorageProvider([]));
        store.setHistoryProviders([
            {
                id: 'chatgpt-web',
                label: 'ChatGPT',
                kind: 'history-provider',
                features: {
                    historySearch: true
                },
                provider: history
            }
        ]);

        await store.setHistorySource('external');
        store.setExternalHistoryQuery('incident');
        await store.submitExternalHistoryQuery();
        expect(store.externalHistoryItems.map((item) => item.id)).toEqual(['remote-2']);

        await store.clearExternalHistoryQuery();

        expect(store.externalHistoryQuery).toBe('');
        expect(store.externalHistoryQuerySubmitted).toBe('');
        expect(history.historyListCalls.at(-1)).toEqual({ query: '' });
        expect(store.externalHistoryItems.map((item) => item.id)).toEqual(['remote-1', 'remote-2']);
    });

    it('toggles question stars and filters starred question index items', async () => {
        const storage = new MockStorageProvider([
            {
                id: 'conversation-1',
                title: 'Question index',
                origin: 'local',
                updatedAt: 10,
                messages: [
                    {
                        id: 'user-1',
                        role: 'user',
                        content: '第一条问题\n第二行',
                        questionId: 'question-1',
                        createdAt: 1
                    },
                    {
                        id: 'assistant-1',
                        role: 'assistant',
                        content: '第一条回答',
                        questionId: 'question-1',
                        createdAt: 2
                    },
                    {
                        id: 'user-2',
                        role: 'user',
                        content: '第二条问题',
                        questionId: 'question-2',
                        createdAt: 3
                    }
                ]
            }
        ]);
        const store = useChatStore();
        store.setProviders(new MockModelProvider(), storage);

        await store.init();
        await store.selectLocalConversation('conversation-1');

        expect(store.questionIndexItems.map((item) => item.title)).toEqual(['第一条问题', '第二条问题']);

        await store.toggleQuestionStar('question-1');
        expect(store.currentConversation?.messages[0]?.starred).toBe(true);

        store.setQuestionIndexFilter('starred');
        expect(store.questionIndexItems).toEqual([
            expect.objectContaining({
                questionId: 'question-1',
                starred: true
            })
        ]);
    });

    it('toggles conversation stars and filters the local sidebar list', async () => {
        const storage = new MockStorageProvider([
            {
                id: 'conversation-1',
                title: 'Star me',
                origin: 'local',
                updatedAt: 10,
                messages: []
            },
            {
                id: 'conversation-2',
                title: 'Keep hidden',
                origin: 'local',
                updatedAt: 9,
                messages: []
            }
        ]);
        const store = useChatStore();
        store.setProviders(new MockModelProvider(), storage);

        await store.init();
        await store.toggleConversationStar('conversation-1');

        expect(store.conversations.find((item) => item.id === 'conversation-1')?.starred).toBe(true);

        store.setLocalConversationFilter('starred');
        expect(store.filteredLocalConversations.map((item) => item.id)).toEqual(['conversation-1']);

        await store.toggleConversationStar('conversation-1');
        expect(store.conversations.find((item) => item.id === 'conversation-1')?.starred).toBeUndefined();
        expect(store.filteredLocalConversations).toEqual([]);
    });

    it('soft deletes legacy question pairs with fallback matching', async () => {
        const storage = new MockStorageProvider([
            {
                id: 'conversation-legacy',
                title: 'Legacy',
                origin: 'local',
                updatedAt: 10,
                messages: [
                    { id: 'legacy-user', role: 'user', content: '旧问题' },
                    { id: 'legacy-assistant', role: 'assistant', content: '旧回答' },
                    { id: 'fresh-user', role: 'user', content: '新问题', questionId: 'question-2' },
                    { id: 'fresh-assistant', role: 'assistant', content: '新回答', questionId: 'question-2' }
                ]
            }
        ]);
        const store = useChatStore();
        store.setProviders(new MockModelProvider(), storage);

        await store.init();
        await store.selectLocalConversation('conversation-legacy');

        const legacyQuestionId = store.questionIndexItems[0]?.questionId;
        expect(legacyQuestionId).toBe('legacy:legacy-user');

        store.setActiveQuestion(legacyQuestionId);
        store.requestScrollToQuestion(legacyQuestionId);
        await store.softDeleteQuestionPair(legacyQuestionId);

        expect(store.currentConversation?.messages[0]?.deleted).toBe(true);
        expect(store.currentConversation?.messages[1]?.deleted).toBe(true);
        expect(store.currentConversation?.messages[2]?.deleted).toBeUndefined();
        expect(store.visibleMessages.map((message) => message.id)).toEqual(['fresh-user', 'fresh-assistant']);
        expect(store.activeQuestionId).toBeNull();
        expect(store.pendingScrollQuestionId).toBeNull();
    });

    it('restores the last question into the draft when deleting the final question', async () => {
        const storage = new MockStorageProvider([
            {
                id: 'conversation-final-question',
                title: 'Final question',
                origin: 'local',
                updatedAt: 10,
                messages: [
                    {
                        id: 'first-user',
                        role: 'user',
                        content: '第一条问题',
                        questionId: 'question-1',
                        createdAt: 1
                    },
                    {
                        id: 'first-assistant',
                        role: 'assistant',
                        content: '第一条回答',
                        questionId: 'question-1',
                        createdAt: 2
                    },
                    {
                        id: 'last-user',
                        role: 'user',
                        content: '最后一个问题',
                        questionId: 'question-2',
                        createdAt: 3
                    },
                    {
                        id: 'last-assistant',
                        role: 'assistant',
                        content: '最后一个回答',
                        questionId: 'question-2',
                        createdAt: 4
                    }
                ]
            }
        ]);
        const store = useChatStore();
        store.setProviders(new MockModelProvider(), storage);

        await store.init();
        await store.selectLocalConversation('conversation-final-question');
        store.setDraftPrompt('');

        await store.softDeleteQuestionPair('question-2');

        expect(store.draftPrompt).toBe('最后一个问题');
        expect(store.draftFocusRequestKey).toBe(1);
        expect(store.currentConversation?.messages[2]?.deleted).toBe(true);
        expect(store.currentConversation?.messages[3]?.deleted).toBe(true);
    });

    it('does not restore the draft when deleting a non-final question', async () => {
        const storage = new MockStorageProvider([
            {
                id: 'conversation-non-final-question',
                title: 'Non final question',
                origin: 'local',
                updatedAt: 10,
                messages: [
                    {
                        id: 'first-user',
                        role: 'user',
                        content: '第一条问题',
                        questionId: 'question-1',
                        createdAt: 1
                    },
                    {
                        id: 'first-assistant',
                        role: 'assistant',
                        content: '第一条回答',
                        questionId: 'question-1',
                        createdAt: 2
                    },
                    {
                        id: 'last-user',
                        role: 'user',
                        content: '最后一个问题',
                        questionId: 'question-2',
                        createdAt: 3
                    },
                    {
                        id: 'last-assistant',
                        role: 'assistant',
                        content: '最后一个回答',
                        questionId: 'question-2',
                        createdAt: 4
                    }
                ]
            }
        ]);
        const store = useChatStore();
        store.setProviders(new MockModelProvider(), storage);

        await store.init();
        await store.selectLocalConversation('conversation-non-final-question');
        store.setDraftPrompt('原始草稿');

        await store.softDeleteQuestionPair('question-1');

        expect(store.draftPrompt).toBe('原始草稿');
        expect(store.draftFocusRequestKey).toBe(0);
        expect(store.currentConversation?.messages[0]?.deleted).toBe(true);
        expect(store.currentConversation?.messages[1]?.deleted).toBe(true);
    });

    it('backfills the draft and enters edit mode for a prior question', async () => {
        const storage = new MockStorageProvider([
            {
                id: 'conversation-edit-backfill',
                title: 'Editable conversation',
                origin: 'local',
                updatedAt: 10,
                messages: [
                    {
                        id: 'user-1',
                        role: 'user',
                        content: '原始问题',
                        questionId: 'question-1',
                        createdAt: 1
                    },
                    {
                        id: 'assistant-1',
                        role: 'assistant',
                        content: '原始回答',
                        questionId: 'question-1',
                        createdAt: 2
                    }
                ]
            }
        ]);
        const store = useChatStore();
        store.setProviders(new MockModelProvider(), storage);

        await store.init();
        await store.selectLocalConversation('conversation-edit-backfill');

        store.startQuestionEdit('question-1');

        expect(store.editingQuestionId).toBe('question-1');
        expect(store.draftPrompt).toBe('原始问题');
        expect(store.draftFocusRequestKey).toBe(1);
        expect(store.currentConversation?.messages.some((message) => message.deleted === true)).toBe(false);
    });

    it('cancels question editing without mutating conversation history', async () => {
        const storage = new MockStorageProvider([
            {
                id: 'conversation-edit-cancel',
                title: 'Editable conversation',
                origin: 'local',
                updatedAt: 10,
                messages: [
                    {
                        id: 'user-1',
                        role: 'user',
                        content: '原始问题',
                        questionId: 'question-1',
                        createdAt: 1
                    },
                    {
                        id: 'assistant-1',
                        role: 'assistant',
                        content: '原始回答',
                        questionId: 'question-1',
                        createdAt: 2
                    }
                ]
            }
        ]);
        const store = useChatStore();
        store.setProviders(new MockModelProvider(), storage);

        await store.init();
        await store.selectLocalConversation('conversation-edit-cancel');
        store.startQuestionEdit('question-1');
        store.setDraftPrompt('修改中的草稿');

        store.cancelQuestionEdit();

        expect(store.editingQuestionId).toBeNull();
        expect(store.draftPrompt).toBe('修改中的草稿');
        expect(store.currentConversation?.messages[0]?.deleted).toBeUndefined();
        expect(store.currentConversation?.messages[1]?.deleted).toBeUndefined();
    });

    it('truncates later turns and resets provider history when resending an edited question', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([
            {
                id: 'conversation-edit-resend',
                title: 'Editable conversation',
                origin: 'local',
                updatedAt: 10,
                messages: [
                    {
                        id: 'user-1',
                        role: 'user',
                        content: '第一问',
                        questionId: 'question-1',
                        createdAt: 1
                    },
                    {
                        id: 'assistant-1',
                        role: 'assistant',
                        content: '第一答',
                        questionId: 'question-1',
                        createdAt: 2
                    },
                    {
                        id: 'user-2',
                        role: 'user',
                        content: '第二问',
                        questionId: 'question-2',
                        createdAt: 3
                    },
                    {
                        id: 'assistant-2',
                        role: 'assistant',
                        content: '第二答',
                        questionId: 'question-2',
                        createdAt: 4
                    }
                ]
            }
        ]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);
        await store.loadLocalConversations();
        await store.selectLocalConversation('conversation-edit-resend');

        store.startQuestionEdit('question-2');
        store.setDraftPrompt('第二问（已修改）');

        await store.sendDraft();

        expect(provider.optionsUsed[0]?.history).toEqual([
            {
                role: 'user',
                content: '第一问',
                attachments: undefined
            },
            {
                role: 'assistant',
                content: '第一答',
                attachments: undefined
            }
        ]);
        expect(store.editingQuestionId).toBeNull();
        expect(store.currentConversation?.messages[2]?.deleted).toBe(true);
        expect(store.currentConversation?.messages[3]?.deleted).toBe(true);
        expect(store.visibleMessages.map((message) => message.content)).toEqual([
            '第一问',
            '第一答',
            '第二问（已修改）',
            'reply:第二问（已修改）'
        ]);
    });

    it('updates the persisted conversation title when resending an edited first question', async () => {
        const provider = new StaticTitleMockModelProvider('新的第一条问题标题应该更新');
        const storage = new MockStorageProvider([
            {
                id: 'conversation-edit-first-title',
                title: '旧标题',
                origin: 'local',
                updatedAt: 10,
                messages: [
                    {
                        id: 'user-1',
                        role: 'user',
                        content: '旧问题',
                        questionId: 'question-1',
                        createdAt: 1
                    },
                    {
                        id: 'assistant-1',
                        role: 'assistant',
                        content: '旧回答',
                        questionId: 'question-1',
                        createdAt: 2
                    },
                    {
                        id: 'user-2',
                        role: 'user',
                        content: '后续问题',
                        questionId: 'question-2',
                        createdAt: 3
                    },
                    {
                        id: 'assistant-2',
                        role: 'assistant',
                        content: '后续回答',
                        questionId: 'question-2',
                        createdAt: 4
                    }
                ]
            }
        ]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);
        await store.loadLocalConversations();
        await store.selectLocalConversation('conversation-edit-first-title');

        store.startQuestionEdit('question-1');
        store.setDraftPrompt('新的第一条问题标题应该更新');

        await store.sendDraft();

        expect(store.currentConversation?.title).toBe('新的第一条问题标题应...');
        expect(storage.conversations[0]?.title).toBe('新的第一条问题标题应...');
    });

    it('generates a provider-backed title after the first successful send', async () => {
        const provider = new StaticTitleMockModelProvider('"事故时间线梳理"');
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);
        await store.startNewConversation();

        store.setDraftPrompt('请帮我梳理这次事故的时间线和影响范围');
        await store.sendDraft();

        expect(store.currentConversation?.title).toBe('事故时间线梳理');
        expect(storage.conversations[0]?.title).toBe('事故时间线梳理');
    });

    it('falls back to a deterministic local title when provider title generation fails', async () => {
        const provider = new TitleFailingMockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);
        await store.startNewConversation();

        store.setDraftPrompt('请帮我梳理这次事故的时间线和影响范围。然后总结修复动作。');
        await store.sendDraft();

        expect(store.currentConversation?.title).toBe('请帮我梳理这次事故的...');
        expect(storage.conversations[0]?.title).toBe('请帮我梳理这次事故的...');
    });

    it('keeps a manual rename during ordinary follow-up sends', async () => {
        const provider = new StaticTitleMockModelProvider('初始标题');
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);
        await store.startNewConversation();

        store.setDraftPrompt('第一问');
        await store.sendDraft();
        await store.renameLocalConversation(store.currentConversation!.id, '手动标题');

        store.setDraftPrompt('第二问');
        await store.sendDraft();

        expect(store.currentConversation?.title).toBe('手动标题');
        expect(storage.conversations[0]?.title).toBe('手动标题');
    });

    it('exits edit mode as soon as an edited question is resent', async () => {
        const provider = new PendingMockModelProvider();
        const storage = new MockStorageProvider([
            {
                id: 'conversation-edit-pending',
                title: 'Editable conversation',
                origin: 'local',
                updatedAt: 10,
                messages: [
                    {
                        id: 'user-1',
                        role: 'user',
                        content: '第一问',
                        questionId: 'question-1',
                        createdAt: 1
                    },
                    {
                        id: 'assistant-1',
                        role: 'assistant',
                        content: '第一答',
                        questionId: 'question-1',
                        createdAt: 2
                    }
                ]
            }
        ]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);
        await store.loadLocalConversations();
        await store.selectLocalConversation('conversation-edit-pending');

        store.startQuestionEdit('question-1');
        store.setDraftPrompt('第一问（已修改）');

        const pending = store.sendDraft();
        await vi.waitFor(() => {
            expect(provider.resolvePending).toBeTypeOf('function');
        });

        expect(store.isGenerating).toBe(true);
        expect(store.editingQuestionId).toBeNull();

        provider.resolvePending?.();
        await pending;
    });

    it('restores the submitted draft when aborting generation', async () => {
        const provider = new AbortableMockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);
        await store.startNewConversation();

        store.setDraftPrompt('需要修改的提问');
        const pending = store.sendDraft();

        expect(store.isGenerating).toBe(true);
        store.abortGeneration();

        expect(provider.aborted).toBe(true);
        expect(store.draftPrompt).toBe('需要修改的提问');
        expect(store.draftFocusRequestKey).toBe(1);
        expect(store.isGenerating).toBe(false);

        await pending;

        expect(store.currentError).toBeNull();
        expect(store.lastSubmittedPrompt).toBeNull();
        expect(store.currentConversation?.messages[0]).toMatchObject({
            role: 'user',
            content: '需要修改的提问'
        });
        expect((await storage.getAllConversations())).toHaveLength(1);
    });

    it('persists a new conversation immediately when the first model request fails', async () => {
        const provider = new FailingMockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);
        store.setWorkspaceMode('agent');
        store.setWorkspaceContext({
            activeAgentKey: '/docs/.agent.json',
            selectedNodePath: '/docs/guide.md',
            activePath: '/docs/guide.md',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Guide'),
                updatedAt: 1,
                version: 'v1',
                canWrite: true
            },
            contextProvider: null
        });

        await store.startNewConversation({
            boundNodeName: 'guide.md',
            agentKey: '/docs/.agent.json',
            documentPath: '/docs/guide.md',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Guide'),
                updatedAt: 1,
                version: 'v1',
                canWrite: true
            }
        });
        store.setDraftPrompt('首次提问失败也要保留');

        await store.sendDraft();

        expect(store.currentError).toBe('Provider unavailable');
        expect(store.currentConversation).toMatchObject({
            boundNodeName: 'guide.md',
            agentKey: '/docs/',
            documentPaths: ['/docs/guide.md']
        });
        expect(store.currentConversation?.messages).toMatchObject([
            {
                role: 'user',
                content: '首次提问失败也要保留'
            },
            {
                role: 'assistant',
                content: ''
            }
        ]);
        expect(await storage.getAllConversations()).toHaveLength(1);
        expect((await storage.getAllConversations())[0]).toMatchObject({
            boundNodeName: 'guide.md',
            agentKey: '/docs/',
            documentPaths: ['/docs/guide.md']
        });
    });

    it('saves and restores the agent view status snapshot', () => {
        const store = useChatStore();

        store.saveAgentViewStatus({
            selectedNodePath: '/docs',
            activePath: '/docs/guide.md',
            activeConversationId: 'conversation-1'
        });

        expect(store.restoreAgentViewStatus()).toEqual({
            selectedNodePath: '/docs',
            activePath: '/docs/guide.md',
            activeConversationId: 'conversation-1'
        });
    });

    it('restores the last active local conversation during init', async () => {
        localStorage.setItem('jarvis:chat:last-local-conversation-id', 'conversation-restored');
        const storage = new MockStorageProvider([
            {
                id: 'conversation-restored',
                title: 'Restored conversation',
                origin: 'local',
                updatedAt: 10,
                messages: [{ id: 'restored-user', role: 'user', content: '恢复这条会话' }]
            }
        ]);
        const store = useChatStore();
        store.setProviders(new MockModelProvider(), storage);
        await store.initializeProviderCatalog(providerCatalog);

        await store.init();

        expect(store.currentConversation?.id).toBe('conversation-restored');
        expect(store.currentConversation?.messages[0]?.content).toBe('恢复这条会话');
    });

    it('resets workspace conversation state without clearing the active conversation', async () => {
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(new MockModelProvider(), storage);
        await store.initializeProviderCatalog(providerCatalog);
        await store.startNewConversation();

        store.currentConversation = {
            id: 'conversation-active',
            title: 'Workspace Chat',
            origin: 'local',
            updatedAt: Date.now(),
            messages: [{ id: 'user-1', role: 'user', content: '保留前的内容' }]
        };
        store.previewConversation = {
            id: 'conversation-preview',
            title: 'Preview Chat',
            origin: 'external-file',
            updatedAt: Date.now(),
            messages: []
        };
        store.historySource = 'external';
        store.currentError = 'temporary error';
        store.currentHistoryErrorCode = 'AUTH_REQUIRED';
        store.isExternalPreviewLoading = true;
        store.externalPreviewLoadingId = 'external-1';
        store.isQuestionIndexPanelOpen = false;
        store.activeQuestionId = 'question-1';
        store.pendingScrollQuestionId = 'question-1';
        store.setDraftPrompt('临时草稿');
        store.lastSubmittedPrompt = '上一条问题';
        store.draftAttachments = [
            {
                id: 'attachment-1',
                type: 'file',
                name: 'note.md',
                mimeType: 'text/markdown',
                size: 10
            }
        ];
        store.attachmentError = '附件错误';
        store.currentProviderId = 'mock-provider';
        store.currentModelId = 'mock-model';

        store.resetWorkspaceConversationState();

        expect(store.currentConversation).toMatchObject({
            id: 'conversation-active',
            title: 'Workspace Chat',
            origin: 'local'
        });
        expect(store.previewConversation).toBeNull();
        expect(store.isPreviewing).toBe(false);
        expect(store.historySource).toBe('local');
        expect(store.currentError).toBeNull();
        expect(store.currentHistoryErrorCode).toBeNull();
        expect(store.isExternalPreviewLoading).toBe(false);
        expect(store.externalPreviewLoadingId).toBeNull();
        expect(store.isQuestionIndexPanelOpen).toBe(true);
        expect(store.activeQuestionId).toBeNull();
        expect(store.pendingScrollQuestionId).toBeNull();
        expect(store.draftPrompt).toBe('');
        expect(store.lastSubmittedPrompt).toBeNull();
        expect(store.draftAttachments).toEqual([]);
        expect(store.attachmentError).toBeNull();
        expect(store.currentProviderId).toBe('mock-provider');
        expect(store.currentModelId).toBe('mock-model');
    });

    it('delegates aborts to AgentRuntime when the runtime is active', async () => {
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        const abort = vi.fn();
        let rejectPending: ((reason?: unknown) => void) | null = null;

        store.setProviders(new MockModelProvider(), storage);
        store.setAgentRuntime({
            run: vi.fn(async (_request, onUpdate) => {
                onUpdate({ text: 'runtime-streaming' });
                await new Promise<never>((_, reject) => {
                    rejectPending = reject;
                });
                throw new Error('unreachable');
            }),
            abort
        });
        await store.initializeProviderCatalog(providerCatalog);
        await store.startNewConversation();

        store.setDraftPrompt('runtime abort');
        const pending = store.sendDraft();

        store.abortGeneration();
        const abortError = new Error('Aborted');
        abortError.name = 'AbortError';
        rejectPending?.(abortError);
        await pending;

        expect(abort).toHaveBeenCalledTimes(1);
        expect(store.draftPrompt).toBe('runtime abort');
        expect(store.currentError).toBeNull();
    });

    it('falls back to the next local conversation after deleting the active history item', async () => {
        const storage = new MockStorageProvider([
            {
                id: 'conversation-newer',
                title: '更新会话',
                origin: 'local',
                updatedAt: 20,
                messages: [{ id: 'newer-user', role: 'user', content: '更新问题' }]
            },
            {
                id: 'conversation-older',
                title: '旧会话',
                origin: 'local',
                updatedAt: 10,
                messages: [{ id: 'older-user', role: 'user', content: '旧问题' }]
            }
        ]);
        const store = useChatStore();
        store.setProviders(new MockModelProvider(), storage);

        await store.init();
        await store.selectLocalConversation('conversation-newer');
        await store.deleteLocalConversation('conversation-newer');

        expect(store.currentConversation?.id).toBe('conversation-older');
        expect(store.conversations.map((conversation) => conversation.id)).toEqual(['conversation-older']);
        expect(await storage.getConversation('conversation-newer')).toBeNull();
    });

    it('starts a new empty conversation when deleting the last local history item', async () => {
        const storage = new MockStorageProvider([
            {
                id: 'conversation-only',
                title: '唯一会话',
                origin: 'local',
                updatedAt: 10,
                messages: [{ id: 'only-user', role: 'user', content: '唯一问题' }]
            }
        ]);
        const store = useChatStore();
        store.setProviders(new MockModelProvider(), storage);

        await store.init();
        await store.selectLocalConversation('conversation-only');
        await store.deleteLocalConversation('conversation-only');

        expect(store.currentConversation?.title).toBe('New Chat');
        expect(store.currentConversation?.messages).toEqual([]);
        expect(store.historySource).toBe('local');
        expect(await storage.getConversation('conversation-only')).toBeNull();
        expect(store.conversations).toHaveLength(0);
    });

    it('surfaces delete failures through currentError', async () => {
        const storage = new FailingStorageProvider([
            {
                id: 'conversation-failing',
                title: '失败会话',
                origin: 'local',
                updatedAt: 10,
                messages: [{ id: 'only-user', role: 'user', content: '唯一问题' }]
            }
        ], new Error('Delete request failed.'));
        const store = useChatStore();
        store.setProviders(new MockModelProvider(), storage);

        await store.init();
        await store.selectLocalConversation('conversation-failing');

        await expect(store.deleteLocalConversation('conversation-failing')).rejects.toMatchObject({
            message: 'Delete request failed.'
        } satisfies Partial<HttpApiError>);
        expect(store.currentError).toBe('Delete request failed.');
        expect(store.currentConversation?.id).toBe('conversation-failing');
    });

    it('renames local conversations and refreshes the active conversation', async () => {
        const storage = new MockStorageProvider([
            {
                id: 'conversation-to-rename',
                title: 'Old title',
                origin: 'local',
                updatedAt: 10,
                messages: []
            }
        ]);
        const store = useChatStore();
        store.setProviders(new MockModelProvider(), storage);

        await store.init();
        await store.selectLocalConversation('conversation-to-rename');
        await store.renameLocalConversation('conversation-to-rename', '  New title  ');

        expect(store.currentConversation?.title).toBe('New title');
        expect(store.currentConversation?.updatedAt).toBe(10);
        expect(storage.conversations[0]?.title).toBe('New title');
        expect(storage.conversations[0]?.updatedAt).toBe(10);

        await store.renameLocalConversation('conversation-to-rename', '   ');
        expect(store.currentConversation?.title).toBe('New Chat');
        expect(store.currentConversation?.updatedAt).toBe(10);
    });

    it('keeps the new empty conversation active when an older send resolves later', async () => {
        const provider = new PendingMockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);
        await store.startNewConversation();

        store.setDraftPrompt('Older in-flight prompt');
        const sending = store.sendDraft();
        const sendingConversationId = store.currentConversation?.id;
        await vi.waitFor(() => {
            expect(provider.resolvePending).toBeTypeOf('function');
        });

        await store.startNewConversation({ boundNodeName: null });
        const newConversationId = store.currentConversation?.id;

        expect(newConversationId).toBeTruthy();
        expect(newConversationId).not.toBe(sendingConversationId);
        expect(store.currentConversation?.messages).toEqual([]);

        provider.resolvePending?.();
        await sending;

        expect(store.currentConversation?.id).toBe(newConversationId);
        expect(store.currentConversation?.messages).toEqual([]);
        expect(storage.conversations.find((conversation) => conversation.id === sendingConversationId)?.messages).toHaveLength(2);
    });

    it('preserves a renamed title when an older send resolves later', async () => {
        const provider = new PendingMockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);
        await store.startNewConversation();

        store.setDraftPrompt('Older in-flight prompt');
        const sending = store.sendDraft();
        const sendingConversationId = store.currentConversation?.id;
        expect(sendingConversationId).toBeTruthy();
        await vi.waitFor(() => {
            expect(provider.resolvePending).toBeTypeOf('function');
        });

        await store.renameLocalConversation(sendingConversationId!, 'Renamed while pending');
        expect(store.currentConversation?.title).toBe('Renamed while pending');

        provider.resolvePending?.();
        await sending;

        expect(store.currentConversation?.id).toBe(sendingConversationId);
        expect(store.currentConversation?.title).toBe('Renamed while pending');
        expect(storage.conversations.find((conversation) => conversation.id === sendingConversationId)?.title).toBe('Renamed while pending');
    });

    it('renames imported external history conversations after they are saved locally', async () => {
        const storage = new MockStorageProvider([
            {
                id: 'external-conversation',
                title: 'External title',
                origin: 'chatgpt-web',
                updatedAt: 10,
                messages: []
            }
        ]);
        const store = useChatStore();
        store.setProviders(new MockModelProvider(), storage);

        await store.init();
        await store.selectLocalConversation('external-conversation');
        await store.renameLocalConversation('external-conversation', 'New title');

        expect(store.currentConversation?.title).toBe('New title');
        expect(storage.conversations[0]?.title).toBe('New title');
    });

    it('archives only in eligible agent-mode markdown document contexts', async () => {
        const provider = new ArchiveResultProvider('{"q":"# Q","a":"# A"}');
        const store = useChatStore();
        store.setProviders(provider, new MockStorageProvider([]));
        await store.initializeProviderCatalog(providerCatalog);

        store.currentConversation = {
            id: 'archive-conversation',
            title: 'Archive conversation',
            origin: 'local',
            updatedAt: 1,
            messages: [
                { id: 'user-1', role: 'user', content: 'Need archive' }
            ]
        };
        store.workspaceMode = 'conversation';
        store.setWorkspaceContext({
            selectedNodePath: '/docs/guide.md',
            activePath: '/docs/guide.md',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Q')
            },
            contextProvider: null,
            onFileChanged: vi.fn()
        });

        expect(store.canArchiveCurrentConversation()).toBe(false);

        store.workspaceMode = 'agent';
        expect(store.canArchiveCurrentConversation()).toBe(true);

        store.setWorkspaceContext({
            selectedNodePath: '/docs',
            activePath: '/docs/guide.md',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Q')
            },
            contextProvider: null,
            onFileChanged: vi.fn()
        });
        expect(store.canArchiveCurrentConversation()).toBe(false);
    });

    it('archives the current conversation into the active markdown document', async () => {
        const provider = new ArchiveResultProvider('{"q":"# Q\\n\\nUpdated question","a":"# A\\n\\nUpdated answer"}');
        let resolveFileChange: (() => void) | null = null;
        const onFileChanged = vi.fn(() => new Promise<void>((resolve) => {
            resolveFileChange = resolve;
        }));
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);

        store.workspaceMode = 'agent';
        store.currentConversation = {
            id: 'archive-conversation',
            title: 'Archive conversation',
            origin: 'local',
            updatedAt: 1,
            messages: [
                { id: 'user-1', role: 'user', content: 'Please update the question.' },
                { id: 'assistant-1', role: 'assistant', content: 'Question updated.' }
            ]
        };
        store.setWorkspaceContext({
            selectedNodePath: '/docs/guide.md',
            activePath: '/docs/guide.md',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Q\n\nOriginal question\n\n***\n\n# A\n\nOriginal answer'),
                documentId: 'doc-guide'
            },
            contextProvider: null,
            onFileChanged
        });

        const archivePromise = store.archiveCurrentConversationToDocument();

        expect(store.archiveConversationProgressPart).toMatchObject({
            kind: 'tool_call',
            title: 'Archive conversation',
            content: 'Archiving the current conversation into the active document.'
        });
        expect(store.currentConversation?.messages).toHaveLength(2);
        expect(store.isArchivingConversation).toBe(true);

        await vi.waitFor(() => {
            expect(onFileChanged).toHaveBeenCalledTimes(1);
        });
        resolveFileChange?.();
        await archivePromise;

        expect(onFileChanged).toHaveBeenCalledWith({
            path: '/docs/guide.md',
            beforeContent: '# Q\n\nOriginal question\n\n***\n\n# A\n\nOriginal answer',
            afterContent: '# Q\n\nUpdated question\n\n***\n\n# A\n\nUpdated answer'
        });
        expect(provider.optionsUsed[0]).toMatchObject({
            modelId: 'static-model',
            modelOptions: {}
        });
        expect(store.archiveConversationProgressPart).toMatchObject({
            kind: 'tool_result',
            title: 'Archive conversation',
            content: 'Conversation archived into the current document.'
        });
        expect(store.archiveFeedback).toEqual({
            tone: 'success',
            message: 'Conversation archived into the current document.'
        });
        expect(store.currentConversation?.archive).toMatchObject({
            documentPath: '/docs/guide.md',
            sourceMessageCount: 2
        });
        expect(store.currentConversationArchiveStatus).toMatchObject({
            state: 'archived',
            documentPath: '/docs/guide.md',
            documentId: 'doc-guide',
            sourceMessageCount: 2
        });
        expect(await storage.getConversation('archive-conversation')).toMatchObject({
            archive: {
                documentPath: '/docs/guide.md',
                documentId: 'doc-guide',
                sourceMessageCount: 2
            }
        });
        expect(store.isArchivingConversation).toBe(false);
    });

    it('reports archive no-change results without writing the document', async () => {
        const provider = new ArchiveResultProvider('{"q":"# Q\\n\\nOriginal question","a":"# A\\n\\nOriginal answer"}');
        const onFileChanged = vi.fn(async () => undefined);
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);

        store.workspaceMode = 'agent';
        store.currentConversation = {
            id: 'archive-conversation',
            title: 'Archive conversation',
            origin: 'local',
            updatedAt: 1,
            messages: [
                { id: 'user-1', role: 'user', content: 'Please update the question.' },
                { id: 'assistant-1', role: 'assistant', content: 'Question updated.' }
            ]
        };
        store.setWorkspaceContext({
            selectedNodePath: '/docs/guide.md',
            activePath: '/docs/guide.md',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Q\n\nOriginal question\n\n***\n\n# A\n\nOriginal answer')
            },
            contextProvider: null,
            onFileChanged
        });

        await store.archiveCurrentConversationToDocument();

        expect(onFileChanged).not.toHaveBeenCalled();
        expect(store.archiveConversationProgressPart).toMatchObject({
            kind: 'tool_result',
            content: 'No new content was archived.'
        });
        expect(store.archiveFeedback).toEqual({
            tone: 'info',
            message: 'No new content was archived.'
        });
        expect(store.currentConversationArchiveStatus).toMatchObject({
            state: 'archived',
            documentPath: '/docs/guide.md',
            sourceMessageCount: 2
        });
        expect(await storage.getConversation('archive-conversation')).toMatchObject({
            archive: {
                documentPath: '/docs/guide.md',
                sourceMessageCount: 2
            }
        });
    });

    it('marks persisted archive status stale after new turns and preserves it across reload', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([
            {
                id: 'archive-conversation',
                title: 'Archive conversation',
                origin: 'local',
                updatedAt: 1,
                archive: {
                    documentPath: '/docs/guide.md',
                    documentId: 'doc-guide',
                    archivedAt: 10,
                    sourceMessageCount: 2
                },
                messages: [
                    { id: 'user-1', role: 'user', content: 'Archived question', questionId: 'q-1' },
                    { id: 'assistant-1', role: 'assistant', content: 'Archived answer', questionId: 'q-1' }
                ]
            }
        ]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);
        await store.loadConversation('archive-conversation');
        store.setWorkspaceContext({
            selectedNodePath: '/docs/guide.md',
            activePath: '/docs/guide.md',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Q\n\nArchived question\n\n***\n\n# A\n\nArchived answer'),
                documentId: 'doc-guide'
            },
            contextProvider: null,
            onFileChanged: vi.fn()
        });

        expect(store.currentConversationArchiveStatus).toMatchObject({
            state: 'archived',
            documentPath: '/docs/guide.md',
            documentId: 'doc-guide',
            sourceMessageCount: 2
        });

        store.setDraftPrompt('Follow-up question');
        await store.sendDraft();

        expect(store.currentConversationArchiveStatus).toMatchObject({
            state: 'stale',
            documentPath: '/docs/guide.md',
            sourceMessageCount: 2
        });

        await store.loadConversation('archive-conversation');
        expect(store.currentConversationArchiveStatus).toMatchObject({
            state: 'stale',
            documentPath: '/docs/guide.md',
            sourceMessageCount: 2
        });
    });

    it('reports archive failures without mutating the document', async () => {
        const provider = new ArchiveResultProvider('not-json');
        const onFileChanged = vi.fn(async () => undefined);
        const store = useChatStore();
        store.setProviders(provider, new MockStorageProvider([]));
        await store.initializeProviderCatalog(providerCatalog);

        store.workspaceMode = 'agent';
        store.currentConversation = {
            id: 'archive-conversation',
            title: 'Archive conversation',
            origin: 'local',
            updatedAt: 1,
            messages: [
                { id: 'user-1', role: 'user', content: 'Please update the question.' },
                { id: 'assistant-1', role: 'assistant', content: 'Question updated.' }
            ]
        };
        store.setWorkspaceContext({
            selectedNodePath: '/docs/guide.md',
            activePath: '/docs/guide.md',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Q\n\nOriginal question')
            },
            contextProvider: null,
            onFileChanged
        });

        await store.archiveCurrentConversationToDocument();

        expect(onFileChanged).not.toHaveBeenCalled();
        expect(store.archiveConversationProgressPart).toMatchObject({
            kind: 'tool_result'
        });
        expect(store.archiveFeedback?.tone).toBe('error');
        expect(store.archiveFeedback?.message).toContain('Archive failed:');
        expect(store.isArchivingConversation).toBe(false);
    });

    it('reports inserted *** divider in archive feedback and progress result', async () => {
        const provider = new ArchiveResultProvider('{"q":"# Q\\n\\nUpdated question","a":"# A\\n\\nUpdated answer"}');
        const onFileChanged = vi.fn(async () => undefined);
        const store = useChatStore();
        store.setProviders(provider, new MockStorageProvider([]));
        await store.initializeProviderCatalog(providerCatalog);

        store.workspaceMode = 'agent';
        store.currentConversation = {
            id: 'archive-conversation',
            title: 'Archive conversation',
            origin: 'local',
            updatedAt: 1,
            messages: [
                { id: 'user-1', role: 'user', content: 'Please update the question.' },
                { id: 'assistant-1', role: 'assistant', content: 'Question updated.' }
            ]
        };
        store.setWorkspaceContext({
            selectedNodePath: '/docs/guide.md',
            activePath: '/docs/guide.md',
            activeDocument: {
                path: '/docs/guide.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Q\n\nOriginal question')
            },
            contextProvider: null,
            onFileChanged
        });

        await store.archiveCurrentConversationToDocument();

        expect(onFileChanged).toHaveBeenCalledWith({
            path: '/docs/guide.md',
            beforeContent: '# Q\n\nOriginal question',
            afterContent: '# Q\n\nUpdated question\n\n***\n\n# A\n\nUpdated answer'
        });
        expect(store.archiveFeedback).toEqual({
            tone: 'success',
            message: 'Conversation archived into the current document. Added a missing *** divider automatically.'
        });
        expect(store.archiveConversationProgressPart).toMatchObject({
            kind: 'tool_result',
            content: 'Conversation archived into the current document. Added a missing *** divider automatically.'
        });
    });

});

describe('useChatStore view-switch UI state', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('stores and reads the scroll position by conversation id', () => {
        const store = useChatStore();
        store.setConversationScrollTop('conv-a', 320);
        store.setConversationScrollTop('conv-b', 80);

        expect(store.conversationScrollTops['conv-a']).toBe(320);
        expect(store.conversationScrollTops['conv-b']).toBe(80);
    });

    it('ignores empty conversation id when storing scroll position', () => {
        const store = useChatStore();
        store.setConversationScrollTop('', 100);

        expect(store.conversationScrollTops['']).toBeUndefined();
    });

    it('stores and reads the active group tab by message id', () => {
        const store = useChatStore();
        store.setMessageGroupActiveTab('msg-1', 'Gemini');

        expect(store.messageGroupActiveTabs['msg-1']).toBe('Gemini');
    });

    it('ignores empty message id when storing the active group tab', () => {
        const store = useChatStore();
        store.setMessageGroupActiveTab('', 'Gemini');

        expect(store.messageGroupActiveTabs['']).toBeUndefined();
    });
});
