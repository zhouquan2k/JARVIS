import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { Conversation, ConversationHistorySummary, IHistoryProvider, IModelProvider, IStorageProvider, ResolvedAgentConfig } from '@packages/core/src';
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
        key: 'deep_research',
        label: 'Deep Research',
        type: 'boolean' as const
    }
];

class MockModelProvider implements IModelProvider {
    id = 'mock-provider';
    promptsUsed: string[] = [];
    optionsUsed: Array<Record<string, unknown>> = [];

    async getAvailableModels() {
        return {
            models: [{ id: 'mock-model', name: 'Mock Model' }],
            defaultModel: 'mock-model'
        };
    }

    async checkAuth(): Promise<boolean> {
        return true;
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

class MockStorageProvider implements IStorageProvider {
    id = 'mock-storage';

    constructor(private readonly conversations: Conversation[]) {}

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
}

class MockHistoryProvider implements IHistoryProvider {
    id = 'chatgpt-web';

    constructor(
        private readonly summaries: ConversationHistorySummary[],
        private readonly details: Record<string, Conversation>
    ) {}

    async getHistoryList(): Promise<ConversationHistorySummary[]> {
        return this.summaries.map((item) => ({ ...item }));
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
            id: 'other-provider',
            name: 'Other Provider',
            models: [{ id: 'other-static', name: 'Other Static' }],
            defaultModel: 'other-static',
            supportedRuntimeModes: ['web']
        }
    ];

    beforeEach(() => {
        setActivePinia(createPinia());
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
        expect(store.workspaceMode).toBe('preview');
        expect(store.previewConversation?.externalId).toBe('remote-1');

        await store.importPreviewConversation();

        expect(store.workspaceMode).toBe('active');
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

        store.setCurrentModelOption('deep_research', true);
        expect(store.currentModelOptions).toEqual({ deep_research: true });
        expect(store.currentConversation?.modelSelection).toEqual({
            providerId: 'mock-provider',
            modelId: 'dynamic-model',
            modelOptions: { deep_research: true }
        });

        store.setCurrentModel('research-only');
        expect(store.currentModelOptions).toEqual({ deep_research: true });
        expect(store.currentConversation?.modelSelection).toEqual({
            providerId: 'mock-provider',
            modelId: 'research-only',
            modelOptions: { deep_research: true }
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
        expect(store.currentConversation?.modelSelection).toEqual({
            providerId: 'mock-provider',
            modelId: 'dynamic-model',
            modelOptions: { web_search: true }
        });
        expect((await storage.getAllConversations())[0]?.modelSelection).toEqual({
            providerId: 'mock-provider',
            modelId: 'dynamic-model',
            modelOptions: { web_search: true }
        });
    });

    it('injects the scoped agent prompt envelope only when an active agent context is present', async () => {
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
        await store.sendMessage('请分析当前文档');

        expect(provider.promptsUsed[0]).toContain('[[Scoped Agent Context]]');
        expect(provider.promptsUsed[0]).toContain('Name: Docs Agent');
        expect(provider.promptsUsed[0]).toContain('Scope Path: /docs');
        expect(provider.promptsUsed[0]).toContain('Model Provider: inherit-current-selection');
        expect(provider.promptsUsed[0]).toContain('Model Name: inherit-current-selection');
        expect(provider.promptsUsed[0]).toContain('[[User Prompt]]\n请分析当前文档');
        expect(store.currentConversation?.messages[0]?.content).toBe('请分析当前文档');

        store.setActiveAgentContext(null);
        await store.sendMessage('第二条消息');

        expect(provider.promptsUsed[1]).toBe('第二条消息');
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
        expect(agentProvider.promptsUsed[0]).toContain('Name: Docs Agent');
        expect(agentProvider.optionsUsed[0]).toMatchObject({
            modelId: 'other-dynamic',
            modelOptions: {}
        });
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
        const historyProvider: IHistoryProvider = {
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
});
