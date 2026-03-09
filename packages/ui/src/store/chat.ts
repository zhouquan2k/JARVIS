import { defineStore } from 'pinia';
import {
    type Conversation,
    type ConversationHistorySummary,
    type ConversationSourceType,
    type IHistoryProvider,
    type IModelProvider,
    type IStorageProvider
} from '@packages/core/src';
import type { ProviderConfig, ProviderModelCatalog } from '@packages/core/config';
import { markRaw, toRaw } from 'vue';

export type WorkspaceHistorySource = 'local' | 'external';
export type WorkspaceMode = 'active' | 'preview';

type ProviderModelLoadState = {
    loading: boolean;
    loaded: boolean;
};

export interface ChatState {
    modelProvider: IModelProvider | null;
    modelProviderResolver: ((providerId: string) => IModelProvider) | null;
    providerModelsResolver: ((providerId: string) => Promise<ProviderModelCatalog>) | null;
    storageProvider: IStorageProvider | null;
    historyProvider: IHistoryProvider | null;
    providerCatalog: ProviderConfig[];
    availableProviders: ProviderConfig[];
    providerModelStates: Record<string, ProviderModelLoadState>;
    conversations: Conversation[];
    currentConversation: Conversation | null;
    externalHistoryItems: ConversationHistorySummary[];
    previewConversation: Conversation | null;
    historySource: WorkspaceHistorySource;
    workspaceMode: WorkspaceMode;
    sidebarCollapsed: boolean;
    isGenerating: boolean;
    currentError: string | null;
    currentProviderId: string;
    currentModelId: string;
}

function cloneConversation(conversation: Conversation): Conversation {
    return {
        ...conversation,
        sync: conversation.sync ? { ...conversation.sync } : undefined,
        compare: conversation.compare ? { ...conversation.compare } : undefined,
        messages: conversation.messages.map((message) => ({ ...message }))
    };
}

function cloneProviderConfig(provider: ProviderConfig): ProviderConfig {
    return {
        ...provider,
        models: provider.models.map((model) => ({ ...model }))
    };
}

function cloneProviders(providers: ProviderConfig[]): ProviderConfig[] {
    return providers.map(cloneProviderConfig);
}

function normalizeLocalConversation(conversation: Conversation): Conversation {
    return {
        ...cloneConversation(conversation),
        sourceType: conversation.sourceType || 'local'
    };
}

function buildImportKey(sourceType?: ConversationSourceType, externalId?: string): string | null {
    if (!sourceType || !externalId) {
        return null;
    }
    return `${sourceType}:${externalId}`;
}

function getImportedConversationKey(conversation: Conversation): string | null {
    return buildImportKey(conversation.sourceType, conversation.externalId);
}

function buildProviderModelStates(providers: ProviderConfig[]): Record<string, ProviderModelLoadState> {
    return Object.fromEntries(
        providers.map((provider) => [provider.id, { loading: false, loaded: false } satisfies ProviderModelLoadState])
    );
}

function isConfiguredDefaultModelError(error: unknown): error is Error {
    return error instanceof Error && error.name === 'ConfiguredDefaultModelNotFoundError';
}

export const useChatStore = defineStore('chat', {
    state: (): ChatState => ({
        modelProvider: null,
        modelProviderResolver: null,
        providerModelsResolver: null,
        storageProvider: null,
        historyProvider: null,
        providerCatalog: [],
        availableProviders: [],
        providerModelStates: {},
        conversations: [],
        currentConversation: null,
        externalHistoryItems: [],
        previewConversation: null,
        historySource: 'local',
        workspaceMode: 'active',
        sidebarCollapsed: false,
        isGenerating: false,
        currentError: null,
        currentProviderId: '',
        currentModelId: ''
    }),

    getters: {
        displayConversation(state): Conversation | null {
            return state.workspaceMode === 'preview' ? state.previewConversation : state.currentConversation;
        },

        isPreviewing(state): boolean {
            return state.workspaceMode === 'preview' && !!state.previewConversation;
        },

        isCurrentProviderModelsLoading(state): boolean {
            if (!state.currentProviderId) {
                return false;
            }

            const loadState = state.providerModelStates[state.currentProviderId];
            return !loadState || loadState.loading || !loadState.loaded;
        }
    },

    actions: {
        resolveModelProvider(providerId?: string): IModelProvider | null {
            const targetProviderId = providerId || this.currentProviderId;
            if (this.modelProviderResolver && targetProviderId) {
                return this.modelProviderResolver(targetProviderId);
            }
            return this.modelProvider;
        },

        resolveProviderConfig(providerId: string): ProviderConfig | undefined {
            return this.availableProviders.find((item) => item.id === providerId);
        },

        setProviders(
            modelProvider: IModelProvider,
            storageProvider: IStorageProvider,
            historyProvider?: IHistoryProvider
        ) {
            this.modelProvider = markRaw(modelProvider);
            if (!this.modelProviderResolver) {
                this.modelProviderResolver = (providerId: string) => {
                    this.modelProvider!.id = providerId;
                    return this.modelProvider!;
                };
            }
            this.storageProvider = markRaw(storageProvider);
            if (historyProvider) {
                this.historyProvider = markRaw(historyProvider);
            }
        },

        setHistoryProvider(provider: IHistoryProvider) {
            this.historyProvider = markRaw(provider);
        },

        setModelProviderResolver(resolver: (providerId: string) => IModelProvider) {
            this.modelProviderResolver = markRaw(resolver);
        },

        setProviderModelsResolver(resolver: (providerId: string) => Promise<ProviderModelCatalog>) {
            this.providerModelsResolver = markRaw(resolver);
        },

        setProviderCatalog(providers: ProviderConfig[]) {
            const nextCatalog = cloneProviders(providers);
            this.providerCatalog = nextCatalog;
            this.availableProviders = cloneProviders(nextCatalog);
            this.providerModelStates = buildProviderModelStates(nextCatalog);

            if (nextCatalog.length === 0) {
                this.currentProviderId = '';
                this.currentModelId = '';
                return;
            }

            if (!nextCatalog.some((item) => item.id === this.currentProviderId)) {
                this.currentProviderId = nextCatalog[0].id;
            }

            this.currentModelId = '';
        },

        setAvailableProviders(providers: ProviderConfig[]) {
            this.setProviderCatalog(providers);
        },

        async initializeProviderCatalog(providers: ProviderConfig[]) {
            this.setProviderCatalog(providers);
            if (this.currentProviderId) {
                await this.ensureProviderModelsLoaded(this.currentProviderId);
            }
        },

        setProviderModelState(providerId: string, nextState: Partial<ProviderModelLoadState>) {
            const current = this.providerModelStates[providerId] || { loading: false, loaded: false };
            this.providerModelStates = {
                ...this.providerModelStates,
                [providerId]: {
                    ...current,
                    ...nextState
                }
            };
        },

        applyProviderModelCatalog(providerId: string, catalog: ProviderModelCatalog) {
            this.availableProviders = this.availableProviders.map((provider) => {
                if (provider.id !== providerId) {
                    return provider;
                }

                return {
                    ...provider,
                    models: catalog.models.map((model) => ({ ...model })),
                    defaultModel: catalog.defaultModel
                };
            });

            if (this.currentProviderId === providerId) {
                const provider = this.resolveProviderConfig(providerId);
                if (provider && !provider.models.some((model) => model.id === this.currentModelId)) {
                    this.currentModelId = provider.defaultModel;
                }
            }
        },

        async loadProviderModels(providerId: string): Promise<ProviderConfig | null> {
            const baseProvider = this.providerCatalog.find((item) => item.id === providerId);
            if (!baseProvider) {
                return null;
            }

            this.setProviderModelState(providerId, { loading: true });

            try {
                const catalog = this.providerModelsResolver
                    ? await this.providerModelsResolver(providerId)
                    : {
                        models: baseProvider.models.map((model) => ({ ...model })),
                        defaultModel: baseProvider.defaultModel
                    };

                this.applyProviderModelCatalog(providerId, catalog);
                this.setProviderModelState(providerId, { loading: false, loaded: true });
            } catch (error) {
                if (isConfiguredDefaultModelError(error)) {
                    this.currentError = error.message;
                    this.setProviderModelState(providerId, { loading: false, loaded: false });
                    throw error;
                }

                this.applyProviderModelCatalog(providerId, {
                    models: baseProvider.models.map((model) => ({ ...model })),
                    defaultModel: baseProvider.defaultModel
                });
                this.setProviderModelState(providerId, { loading: false, loaded: true });
            }

            return this.resolveProviderConfig(providerId) || null;
        },

        async ensureProviderModelsLoaded(providerId: string): Promise<ProviderConfig | null> {
            const loadState = this.providerModelStates[providerId];
            if (loadState?.loaded && !loadState.loading) {
                return this.resolveProviderConfig(providerId) || null;
            }

            return this.loadProviderModels(providerId);
        },

        async init() {
            if (this.currentProviderId) {
                await this.ensureProviderModelsLoaded(this.currentProviderId);
            }

            await this.loadLocalConversations();
            if (this.historySource === 'external' && this.historyProvider) {
                await this.loadExternalHistory();
            }
        },

        async setCurrentModelProvider(providerId: string, modelId?: string) {
            if (!providerId) {
                return;
            }

            this.currentProviderId = providerId;
            this.currentModelId = '';
            this.currentError = null;

            const provider = await this.ensureProviderModelsLoaded(providerId);
            if (!provider) {
                return;
            }

            this.currentModelId = modelId && provider.models.some((item) => item.id === modelId)
                ? modelId
                : provider.defaultModel;
        },

        setCurrentModel(modelId: string) {
            const provider = this.resolveProviderConfig(this.currentProviderId);
            if (!provider || !provider.models.some((item) => item.id === modelId)) {
                return;
            }

            this.currentModelId = modelId;
        },

        async checkAuth() {
            const provider = this.resolveModelProvider();
            if (!provider) return false;
            return provider.checkAuth();
        },

        async loadLocalConversations() {
            if (!this.storageProvider) return;

            const conversations = await this.storageProvider.getAllConversations();
            const localConversations = conversations
                .filter((conversation) => !conversation.compare && !conversation.sync?.deleted)
                .map(normalizeLocalConversation);

            this.conversations = localConversations;

            if (this.currentConversation) {
                const refreshed = localConversations.find((item) => item.id === this.currentConversation?.id);
                if (refreshed) {
                    this.currentConversation = refreshed;
                } else {
                    this.currentConversation = null;
                }
            }

            if (this.externalHistoryItems.length > 0) {
                this.externalHistoryItems = this.applyImportedFlags(this.externalHistoryItems);
            }
        },

        async loadConversation(id: string) {
            if (!this.storageProvider) return;
            const chat = await this.storageProvider.getConversation(id);
            if (chat && !chat.compare && !chat.sync?.deleted) {
                this.currentConversation = normalizeLocalConversation(chat);
            }
        },

        async selectLocalConversation(id: string) {
            await this.loadConversation(id);
            this.historySource = 'local';
            this.workspaceMode = 'active';
            this.previewConversation = null;
            this.currentError = null;
        },

        async startNewConversation() {
            this.currentConversation = {
                id: crypto.randomUUID(),
                title: 'New Chat',
                sourceType: 'local',
                messages: [],
                updatedAt: Date.now()
            };
            this.workspaceMode = 'active';
            this.historySource = 'local';
            this.previewConversation = null;
            this.currentError = null;
        },

        setSidebarCollapsed(collapsed: boolean) {
            this.sidebarCollapsed = collapsed;
        },

        async setHistorySource(source: WorkspaceHistorySource) {
            this.historySource = source;
            if (source === 'external' && this.historyProvider) {
                await this.loadExternalHistory();
            }
        },

        async loadExternalHistory() {
            if (!this.historyProvider) {
                return;
            }

            const items = await this.historyProvider.getHistoryList();
            this.externalHistoryItems = this.applyImportedFlags(items);
        },

        async previewExternalConversation(externalId: string) {
            if (!this.historyProvider) {
                throw new Error('History provider is not initialized');
            }

            this.currentError = null;
            const conversation = await this.historyProvider.getHistoryDetail(externalId);
            this.previewConversation = cloneConversation(conversation);
            this.workspaceMode = 'preview';
            this.historySource = 'external';
        },

        exitPreview() {
            this.workspaceMode = 'active';
            this.previewConversation = null;
            this.historySource = 'local';
        },

        async importPreviewConversation() {
            if (!this.storageProvider || !this.previewConversation) {
                return;
            }

            const preview = this.previewConversation;
            const importKey = buildImportKey(preview.sourceType, preview.externalId);
            const existingConversation = importKey
                ? this.conversations.find((conversation) => getImportedConversationKey(conversation) === importKey)
                : null;

            if (existingConversation) {
                this.currentConversation = existingConversation;
            } else {
                const importedConversation: Conversation = {
                    ...cloneConversation(preview),
                    id: crypto.randomUUID(),
                    sourceType: preview.sourceType || 'chatgpt_web',
                    externalId: preview.externalId || preview.backendId,
                    backendId: preview.backendId || preview.externalId,
                    updatedAt: Date.now()
                };

                await this.storageProvider.saveConversation(toRaw(importedConversation));
                this.currentConversation = importedConversation;
            }

            await this.loadLocalConversations();
            if (this.historyProvider) {
                await this.loadExternalHistory();
            }

            this.workspaceMode = 'active';
            this.historySource = 'local';
            this.previewConversation = null;
            this.currentError = null;
        },

        async sendMessage(prompt: string) {
            if (this.workspaceMode === 'preview') {
                return;
            }

            if (!this.currentConversation) {
                await this.startNewConversation();
            }

            if (!this.currentModelId) {
                throw new Error('Provider model catalog is not ready');
            }

            const userMsgId = crypto.randomUUID();
            const assistantMsgId = crypto.randomUUID();

            this.currentConversation!.messages.push({
                id: userMsgId,
                role: 'user',
                content: prompt
            });

            this.currentConversation!.messages.push({
                id: assistantMsgId,
                role: 'assistant',
                content: ''
            });

            this.isGenerating = true;
            this.currentError = null;

            try {
                const provider = this.resolveModelProvider();
                if (!provider || !this.storageProvider) {
                    throw new Error('Providers not initialized');
                }

                this.currentConversation!.sourceType = this.currentConversation!.sourceType || 'local';
                const backendId = this.currentConversation!.backendId;

                const result = await provider.sendMessage(
                    prompt,
                    { context: { conversationId: backendId }, modelId: this.currentModelId },
                    (chunk: string) => {
                        const lastMsg = this.currentConversation!.messages[this.currentConversation!.messages.length - 1];
                        if (lastMsg.role === 'assistant') {
                            lastMsg.content = chunk;
                        }
                    }
                );

                this.currentConversation!.backendId = result.conversationId;
                const lastMsg = this.currentConversation!.messages[this.currentConversation!.messages.length - 1];
                if (lastMsg.role === 'assistant') {
                    lastMsg.content = result.text;
                }

                if (this.currentConversation!.title === 'New Chat') {
                    this.currentConversation!.title = prompt.substring(0, 30) + (prompt.length > 30 ? '...' : '');
                }

                this.currentConversation!.updatedAt = Date.now();
                await this.storageProvider.saveConversation(toRaw(this.currentConversation!));
                await this.loadLocalConversations();
                if (this.historyProvider && this.externalHistoryItems.length > 0) {
                    await this.loadExternalHistory();
                }
            } catch (err: unknown) {
                this.currentError = err instanceof Error ? err.message : 'Error sending message';
            } finally {
                this.isGenerating = false;
            }
        },

        abort() {
            const provider = this.resolveModelProvider();
            if (provider) {
                provider.abort();
            }
            this.isGenerating = false;
        },

        applyImportedFlags(items: ConversationHistorySummary[]): ConversationHistorySummary[] {
            const importedKeys = new Set(
                this.conversations
                    .map((conversation) => getImportedConversationKey(conversation))
                    .filter((item): item is string => !!item)
            );

            return items.map((item) => ({
                ...item,
                isImported: importedKeys.has(buildImportKey(item.sourceType, item.id) || '')
            }));
        }
    }
});
