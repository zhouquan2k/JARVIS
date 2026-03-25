import { defineStore } from 'pinia';
import {
    cloneConversation,
    type Conversation,
    type ConversationModelSelection,
    type ConversationMessage,
    type ConversationHistorySummary,
    cloneConversationMessage,
    ExternalHistoryError,
    type ExternalHistoryProviderEntry,
    type ExternalHistoryProviderId,
    type IHistoryProvider,
    type IModelProvider,
    type IStorageProvider,
    type MessageAttachment
} from '@packages/core/src';
import type { ModelConfig, ModelOptionDefinition, ProviderConfig, ProviderModelCatalog } from '@packages/core/config';
import { markRaw, toRaw } from 'vue';

export type WorkspaceHistorySource = 'local' | 'external';
export type WorkspaceMode = 'active' | 'preview';
export type ExternalFileImportHandler = () => Promise<Conversation | Conversation[] | null>;
export type QuestionIndexFilter = 'all' | 'starred';

type ProviderModelLoadState = {
    loading: boolean;
    loaded: boolean;
};

export interface QuestionIndexItem {
    questionId: string;
    title: string;
    starred: boolean;
    deleted: boolean;
    messageId: string;
}

export interface ChatState {
    modelProvider: IModelProvider | null;
    modelProviderResolver: ((providerId: string) => IModelProvider) | null;
    providerModelsResolver: ((providerId: string) => Promise<ProviderModelCatalog>) | null;
    storageProvider: IStorageProvider | null;
    historyProviders: ExternalHistoryProviderEntry[];
    externalFileImportHandler: ExternalFileImportHandler | null;
    activeExternalProviderId: ExternalHistoryProviderId;
    providerCatalog: ProviderConfig[];
    availableProviders: ProviderConfig[];
    providerModelStates: Record<string, ProviderModelLoadState>;
    conversations: Conversation[];
    currentConversation: Conversation | null;
    externalHistoryItems: ConversationHistorySummary[];
    isExternalHistoryLoading: boolean;
    isExternalPreviewLoading: boolean;
    externalPreviewLoadingId: string | null;
    previewConversation: Conversation | null;
    historySource: WorkspaceHistorySource;
    workspaceMode: WorkspaceMode;
    sidebarCollapsed: boolean;
    isGenerating: boolean;
    isAbortRequested: boolean;
    currentError: string | null;
    currentProviderId: string;
    currentModelId: string;
    currentModelOptions: Record<string, boolean>;
    questionIndexFilter: QuestionIndexFilter;
    isQuestionIndexPanelOpen: boolean;
    activeQuestionId: string | null;
    pendingScrollQuestionId: string | null;
    draftPrompt: string;
    lastSubmittedPrompt: string | null;
    draftFocusRequestKey: number;
    draftAttachments: MessageAttachment[];
    attachmentError: string | null;
}

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const FILE_EXTENSION_MIME_TYPES: Record<string, string> = {
    txt: 'text/plain',
    md: 'text/markdown',
    markdown: 'text/markdown',
    csv: 'text/csv',
    json: 'application/json',
    xml: 'application/xml',
    html: 'text/html',
    htm: 'text/html',
    yml: 'application/yaml',
    yaml: 'application/yaml'
};

function toBase64(bytes: Uint8Array): string {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(bytes).toString('base64');
    }

    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize);
        binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
}

async function fileToAttachment(file: File): Promise<MessageAttachment> {
    const buffer = await file.arrayBuffer();
    const base64Data = toBase64(new Uint8Array(buffer));
    const extension = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() || '' : '';
    const inferredMimeType = FILE_EXTENSION_MIME_TYPES[extension];
    const resolvedMimeType = file.type || inferredMimeType || 'application/octet-stream';

    return {
        id: crypto.randomUUID(),
        type: resolvedMimeType.startsWith('image/') ? 'image' : 'file',
        name: file.name,
        mimeType: resolvedMimeType,
        size: file.size,
        base64Data,
        previewBase64: resolvedMimeType.startsWith('image/') ? base64Data : undefined
    };
}

function cloneModelOptionDefinitions(options?: ModelOptionDefinition[]): ModelOptionDefinition[] | undefined {
    return options?.map((option) => ({
        ...option,
        conflictsWith: option.conflictsWith ? [...option.conflictsWith] : undefined
    }));
}

function cloneModelConfig(model: ModelConfig): ModelConfig {
    return {
        ...model,
        options: cloneModelOptionDefinitions(model.options)
    };
}

function cloneModelOptions(value: Record<string, boolean> = {}): Record<string, boolean> {
    return Object.fromEntries(
        Object.entries(value).filter((entry): entry is [string, boolean] => {
            return typeof entry[0] === 'string' && entry[0].length > 0 && entry[1] === true;
        })
    );
}

function cloneProviderConfig(provider: ProviderConfig): ProviderConfig {
    return {
        ...provider,
        models: provider.models.map(cloneModelConfig)
    };
}

function cloneProviders(providers: ProviderConfig[]): ProviderConfig[] {
    return providers.map(cloneProviderConfig);
}

function cloneHistoryProviderEntry(entry: ExternalHistoryProviderEntry): ExternalHistoryProviderEntry {
    return {
        ...entry,
        provider: entry.provider ? markRaw(entry.provider) : undefined
    };
}

function resolveProviderLabel(providerId: ExternalHistoryProviderId): string {
    switch (providerId) {
        case 'chatgpt-web':
            return 'ChatGPT';
        case 'gemini-web':
            return 'Gemini';
        case 'external-file':
            return '外部文件导入';
        default:
            return providerId;
    }
}

function normalizeStoredConversation(conversation: Conversation): Conversation {
    return cloneConversation(conversation);
}

function resolveModelConfig(provider: ProviderConfig | undefined, modelId: string): ModelConfig | undefined {
    if (!provider || !modelId) {
        return undefined;
    }

    return provider.models.find((model) => model.id === modelId);
}

function modelOptionsConflict(
    definition: ModelOptionDefinition,
    otherKey: string,
    definitionsByKey: Map<string, ModelOptionDefinition>
): boolean {
    if (definition.conflictsWith?.includes(otherKey)) {
        return true;
    }

    return definitionsByKey.get(otherKey)?.conflictsWith?.includes(definition.key) === true;
}

function normalizeModelOptions(
    model: ModelConfig | undefined,
    source: Record<string, boolean> = {},
    prioritizedChange?: { key: string; enabled: boolean }
): Record<string, boolean> {
    const definitions = model?.options || [];
    if (definitions.length === 0) {
        return {};
    }

    const definitionsByKey = new Map(definitions.map((definition) => [definition.key, definition]));
    const enabledOrder: string[] = [];

    definitions
        .filter((definition) => definition.defaultValue === true)
        .forEach((definition) => enabledOrder.push(definition.key));

    Object.entries(source).forEach(([key, enabled]) => {
        if (enabled !== true || !definitionsByKey.has(key) || enabledOrder.includes(key)) {
            return;
        }

        enabledOrder.push(key);
    });

    if (prioritizedChange?.enabled && definitionsByKey.has(prioritizedChange.key)) {
        const existingIndex = enabledOrder.indexOf(prioritizedChange.key);
        if (existingIndex >= 0) {
            enabledOrder.splice(existingIndex, 1);
        }
        enabledOrder.push(prioritizedChange.key);
    }

    if (prioritizedChange && !prioritizedChange.enabled) {
        const existingIndex = enabledOrder.indexOf(prioritizedChange.key);
        if (existingIndex >= 0) {
            enabledOrder.splice(existingIndex, 1);
        }
    }

    const normalized = new Set<string>();

    enabledOrder.forEach((key) => {
        const definition = definitionsByKey.get(key);
        if (!definition) {
            return;
        }

        Array.from(normalized).forEach((activeKey) => {
            if (modelOptionsConflict(definition, activeKey, definitionsByKey)) {
                normalized.delete(activeKey);
            }
        });

        normalized.add(key);
    });

    return Object.fromEntries(Array.from(normalized).map((key) => [key, true]));
}

function buildConversationModelSelection(
    providerId: string,
    modelId: string,
    modelOptions: Record<string, boolean>
): ConversationModelSelection | undefined {
    if (!providerId || !modelId) {
        return undefined;
    }

    return {
        providerId,
        modelId,
        modelOptions: cloneModelOptions(modelOptions)
    };
}

function getQuestionKey(message: ConversationMessage): string {
    return message.questionId || `legacy:${message.id}`;
}

function getQuestionTitle(message: ConversationMessage): string {
    const firstLine = message.content.split(/\r?\n/u, 1)[0]?.trim() || '';
    if (firstLine) {
        return firstLine;
    }

    return message.attachments?.length ? '已发送附件' : '空白问题';
}

function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
}

function resolveQuestionPairIndices(messages: ConversationMessage[], questionId: string): number[] {
    const userIndex = messages.findIndex((message) => {
        return message.role === 'user' && getQuestionKey(message) === questionId;
    });
    if (userIndex < 0) {
        return [];
    }

    const userMessage = messages[userIndex];
    if (userMessage.questionId) {
        return messages.reduce<number[]>((indices, message, index) => {
            if (message.questionId === userMessage.questionId) {
                indices.push(index);
            }
            return indices;
        }, []);
    }

    const indices = [userIndex];
    for (let index = userIndex + 1; index < messages.length; index += 1) {
        const message = messages[index];
        if (message.role === 'assistant') {
            indices.push(index);
            break;
        }

        if (message.role === 'user') {
            break;
        }
    }

    return indices;
}

function buildQuestionIndexItems(
    messages: ConversationMessage[],
    filter: QuestionIndexFilter
): QuestionIndexItem[] {
    return messages
        .filter((message) => message.role === 'user' && message.deleted !== true)
        .map((message) => ({
            questionId: getQuestionKey(message),
            title: getQuestionTitle(message),
            starred: message.starred === true,
            deleted: message.deleted === true,
            messageId: message.id
        }))
        .filter((item) => filter === 'all' || item.starred);
}

function buildVisibleMessages(messages: ConversationMessage[]): ConversationMessage[] {
    return messages.filter((message) => message.deleted !== true);
}

function buildProviderHistory(messages: ConversationMessage[]) {
    return buildVisibleMessages(messages).map((message) => ({
        role: message.role,
        content: message.content,
        attachments: message.attachments?.map((attachment) => ({ ...attachment }))
    }));
}

function buildImportKey(origin?: Conversation['origin'], externalId?: string): string | null {
    if (!origin || origin === 'local' || !externalId) {
        return null;
    }

    return `${origin}:${externalId}`;
}

function getImportedConversationKey(conversation: Conversation): string | null {
    return buildImportKey(conversation.origin, conversation.externalId);
}

function buildProviderModelStates(providers: ProviderConfig[]): Record<string, ProviderModelLoadState> {
    return Object.fromEntries(
        providers.map((provider) => [provider.id, { loading: false, loaded: false } satisfies ProviderModelLoadState])
    );
}

function isConfiguredDefaultModelError(error: unknown): error is Error {
    return error instanceof Error && error.name === 'ConfiguredDefaultModelNotFoundError';
}

function formatHistoryError(error: unknown): string {
    if (error instanceof ExternalHistoryError) {
        switch (error.code) {
            case 'AUTH_REQUIRED':
                return '请先登录对应站点后再重试。';
            case 'CONFIG_UNAVAILABLE':
                return '远程抓取配置当前不可用，请稍后再试。';
            case 'SELECTOR_MISMATCH':
                return '页面结构已变化，当前暂时无法抓取该来源历史。';
            case 'DETAIL_NOT_FOUND':
                return '未找到这条外部会话详情。';
            case 'TAB_UNAVAILABLE':
                return error.message || '无法准备外部站点标签页，请稍后再试。';
            default:
                return error.message;
        }
    }

    return error instanceof Error ? error.message : '外部历史加载失败。';
}

export const useChatStore = defineStore('chat', {
    state: (): ChatState => ({
        modelProvider: null,
        modelProviderResolver: null,
        providerModelsResolver: null,
        storageProvider: null,
        historyProviders: [],
        externalFileImportHandler: null,
        activeExternalProviderId: 'chatgpt-web',
        providerCatalog: [],
        availableProviders: [],
        providerModelStates: {},
        conversations: [],
        currentConversation: null,
        externalHistoryItems: [],
        isExternalHistoryLoading: false,
        isExternalPreviewLoading: false,
        externalPreviewLoadingId: null,
        previewConversation: null,
        historySource: 'local',
        workspaceMode: 'active',
        sidebarCollapsed: false,
        isGenerating: false,
        isAbortRequested: false,
        currentError: null,
        currentProviderId: '',
        currentModelId: '',
        currentModelOptions: {},
        questionIndexFilter: 'all',
        isQuestionIndexPanelOpen: true,
        activeQuestionId: null,
        pendingScrollQuestionId: null,
        draftPrompt: '',
        lastSubmittedPrompt: null,
        draftFocusRequestKey: 0,
        draftAttachments: [],
        attachmentError: null
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
        },

        activeExternalProvider(state): ExternalHistoryProviderEntry | null {
            return state.historyProviders.find((entry) => entry.id === state.activeExternalProviderId) || null;
        },

        questionIndexItems(state): QuestionIndexItem[] {
            if (state.workspaceMode === 'preview' || !state.currentConversation) {
                return [];
            }

            return buildQuestionIndexItems(state.currentConversation.messages, state.questionIndexFilter);
        },

        visibleMessages(state): ConversationMessage[] {
            const conversation = state.workspaceMode === 'preview' ? state.previewConversation : state.currentConversation;
            if (!conversation) {
                return [];
            }

            return state.workspaceMode === 'preview'
                ? conversation.messages.map(cloneConversationMessage)
                : buildVisibleMessages(conversation.messages).map(cloneConversationMessage);
        },

        currentProviderConfig(state): ProviderConfig | null {
            return state.availableProviders.find((item) => item.id === state.currentProviderId) || null;
        },

        currentModelConfig(state): ModelConfig | null {
            return resolveModelConfig(
                state.availableProviders.find((item) => item.id === state.currentProviderId),
                state.currentModelId
            ) || null;
        },

        currentModelOptionDefinitions(): ModelOptionDefinition[] {
            return cloneModelOptionDefinitions(this.currentModelConfig?.options) || [];
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

        resolveModelConfig(providerId: string, modelId: string): ModelConfig | undefined {
            return resolveModelConfig(this.resolveProviderConfig(providerId), modelId);
        },

        buildCurrentConversationModelSelection(): ConversationModelSelection | undefined {
            return buildConversationModelSelection(this.currentProviderId, this.currentModelId, this.currentModelOptions);
        },

        syncCurrentConversationModelSelection() {
            if (!this.currentConversation || this.workspaceMode !== 'active' || this.currentConversation.compare) {
                return;
            }

            this.currentConversation.modelSelection = this.buildCurrentConversationModelSelection();
        },

        applyCurrentModelState(modelId: string, sourceOptions: Record<string, boolean> = {}) {
            this.currentModelId = modelId;
            this.currentModelOptions = normalizeModelOptions(
                this.resolveModelConfig(this.currentProviderId, modelId),
                sourceOptions
            );
            this.syncCurrentConversationModelSelection();
        },

        async applyConversationModelSelection(conversation: Conversation | null) {
            if (!conversation || this.workspaceMode !== 'active') {
                return;
            }

            const modelSelection = conversation.modelSelection;
            if (modelSelection?.providerId) {
                await this.setCurrentModelProvider(modelSelection.providerId, modelSelection.modelId);
                this.currentModelOptions = normalizeModelOptions(
                    this.currentModelConfig || undefined,
                    modelSelection.modelOptions
                );
                this.syncCurrentConversationModelSelection();
                return;
            }

            if (!this.currentProviderId && this.availableProviders[0]?.id) {
                await this.setCurrentModelProvider(this.availableProviders[0].id);
                return;
            }

            if (this.currentProviderId && !this.currentModelId) {
                await this.setCurrentModelProvider(this.currentProviderId);
                return;
            }

            this.currentModelOptions = normalizeModelOptions(this.currentModelConfig || undefined, this.currentModelOptions);
            this.syncCurrentConversationModelSelection();
        },

        resolveHistoryProviderEntry(providerId = this.activeExternalProviderId): ExternalHistoryProviderEntry | null {
            return this.historyProviders.find((entry) => entry.id === providerId) || null;
        },

        resolveHistoryProvider(providerId = this.activeExternalProviderId): IHistoryProvider | null {
            const entry = this.resolveHistoryProviderEntry(providerId);
            return entry?.kind === 'history-provider' && entry.provider ? entry.provider : null;
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
                this.setHistoryProvider(historyProvider);
            }
        },

        setHistoryProvider(provider: IHistoryProvider) {
            const currentEntries = this.historyProviders.filter((entry) => entry.id !== provider.id);
            this.setHistoryProviders([
                ...currentEntries,
                {
                    id: provider.id,
                    label: resolveProviderLabel(provider.id),
                    kind: 'history-provider',
                    provider
                }
            ]);
        },

        setHistoryProviders(entries: ExternalHistoryProviderEntry[]) {
            this.historyProviders = entries.map(cloneHistoryProviderEntry);

            if (!this.historyProviders.some((entry) => entry.id === this.activeExternalProviderId)) {
                this.activeExternalProviderId = this.historyProviders[0]?.id || 'chatgpt-web';
            }
        },

        setExternalFileImportHandler(handler: ExternalFileImportHandler | null) {
            this.externalFileImportHandler = handler ? markRaw(handler) : null;
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
                this.currentModelOptions = {};
                return;
            }

            if (!nextCatalog.some((item) => item.id === this.currentProviderId)) {
                this.currentProviderId = nextCatalog[0].id;
            }

            this.currentModelId = '';
            this.currentModelOptions = {};
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
                    models: catalog.models.map(cloneModelConfig),
                    defaultModel: catalog.defaultModel
                };
            });

            if (this.currentProviderId === providerId) {
                const provider = this.resolveProviderConfig(providerId);
                const selectionBackfill = this.currentConversation?.modelSelection?.providerId === providerId
                    ? this.currentConversation.modelSelection.modelOptions
                    : this.currentModelOptions;
                if (provider && !provider.models.some((model) => model.id === this.currentModelId)) {
                    const nextSourceOptions = this.currentConversation?.modelSelection?.providerId === providerId
                        && this.currentConversation.modelSelection.modelId === provider.defaultModel
                        ? this.currentConversation.modelSelection.modelOptions
                        : selectionBackfill;
                    this.applyCurrentModelState(provider.defaultModel, nextSourceOptions);
                    return;
                }

                this.currentModelOptions = normalizeModelOptions(this.currentModelConfig || undefined, selectionBackfill);
                this.syncCurrentConversationModelSelection();
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
                        models: baseProvider.models.map(cloneModelConfig),
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
                    models: baseProvider.models.map(cloneModelConfig),
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
            if (this.historySource === 'external') {
                await this.refreshActiveExternalSource();
            }
        },

        async setCurrentModelProvider(providerId: string, modelId?: string) {
            if (!providerId) {
                return;
            }

            const providerConfig = this.resolveProviderConfig(providerId) || this.providerCatalog.find((item) => item.id === providerId);
            if (!providerConfig) {
                return;
            }

            this.currentProviderId = providerId;
            this.currentModelId = '';
            this.currentModelOptions = {};
            this.currentError = null;

            const provider = await this.ensureProviderModelsLoaded(providerId);
            if (!provider) {
                return;
            }

            const nextModelId = modelId && provider.models.some((item) => item.id === modelId)
                ? modelId
                : provider.defaultModel;
            const sourceOptions = this.currentConversation?.modelSelection?.providerId === providerId
                && this.currentConversation.modelSelection.modelId === nextModelId
                ? this.currentConversation.modelSelection.modelOptions
                : this.currentModelOptions;

            this.applyCurrentModelState(nextModelId, sourceOptions);
        },

        setCurrentModel(modelId: string) {
            const provider = this.resolveProviderConfig(this.currentProviderId);
            if (!provider || !provider.models.some((item) => item.id === modelId)) {
                return;
            }

            this.applyCurrentModelState(modelId, this.currentModelOptions);
        },

        setCurrentModelOption(key: string, enabled: boolean) {
            const model = this.currentModelConfig || undefined;
            if (!model?.options?.some((option) => option.key === key)) {
                return;
            }

            this.currentModelOptions = normalizeModelOptions(model, this.currentModelOptions, { key, enabled });
            this.syncCurrentConversationModelSelection();
        },

        setDraftPrompt(prompt: string) {
            this.draftPrompt = prompt;
        },

        setQuestionIndexFilter(filter: QuestionIndexFilter) {
            this.questionIndexFilter = filter;
        },

        setQuestionIndexPanelOpen(open: boolean) {
            this.isQuestionIndexPanelOpen = open;
        },

        requestScrollToQuestion(questionId: string | null) {
            this.pendingScrollQuestionId = questionId;
        },

        setActiveQuestion(questionId: string | null) {
            this.activeQuestionId = questionId;
        },

        async checkAuth() {
            const provider = this.resolveModelProvider();
            if (!provider) {
                return false;
            }
            return provider.checkAuth();
        },

        async loadLocalConversations() {
            if (!this.storageProvider) {
                return;
            }

            const conversations = await this.storageProvider.getAllConversations();
            const localConversations = conversations
                .filter((conversation) => !conversation.compare && !conversation.sync?.deleted)
                .map(normalizeStoredConversation);

            this.conversations = localConversations;

            if (this.currentConversation) {
                const refreshed = localConversations.find((item) => item.id === this.currentConversation?.id);
                this.currentConversation = refreshed || null;
            }

            if (this.externalHistoryItems.length > 0) {
                this.externalHistoryItems = this.applyImportedFlags(this.externalHistoryItems);
            }
        },

        async loadConversation(id: string) {
            if (!this.storageProvider) {
                return;
            }

            const chat = await this.storageProvider.getConversation(id);
            if (chat && !chat.compare && !chat.sync?.deleted) {
                this.currentConversation = normalizeStoredConversation(chat);
            }
        },

        async selectLocalConversation(id: string) {
            await this.loadConversation(id);
            this.historySource = 'local';
            this.workspaceMode = 'active';
            this.previewConversation = null;
            this.currentError = null;
            this.isQuestionIndexPanelOpen = true;
            this.activeQuestionId = null;
            this.pendingScrollQuestionId = null;
            await this.applyConversationModelSelection(this.currentConversation);
        },

        async deleteLocalConversation(id: string) {
            if (!this.storageProvider) {
                return;
            }

            const isDeletingCurrentConversation = this.workspaceMode === 'active' && this.currentConversation?.id === id;

            await this.storageProvider.deleteConversation(id);
            await this.loadLocalConversations();

            if (!isDeletingCurrentConversation) {
                return;
            }

            const fallbackConversation = this.conversations.find((conversation) => conversation.id !== id) ?? null;
            if (fallbackConversation) {
                await this.selectLocalConversation(fallbackConversation.id);
                return;
            }

            await this.startNewConversation();
        },

        async startNewConversation() {
            this.currentConversation = {
                id: crypto.randomUUID(),
                title: 'New Chat',
                origin: 'local',
                messages: [],
                updatedAt: Date.now(),
                modelSelection: this.buildCurrentConversationModelSelection()
            };
            this.workspaceMode = 'active';
            this.historySource = 'local';
            this.previewConversation = null;
            this.currentError = null;
            this.isQuestionIndexPanelOpen = true;
            this.activeQuestionId = null;
            this.pendingScrollQuestionId = null;
            this.syncCurrentConversationModelSelection();
        },

        setSidebarCollapsed(collapsed: boolean) {
            this.sidebarCollapsed = collapsed;
        },

        async setHistorySource(source: WorkspaceHistorySource) {
            this.historySource = source;
            this.currentError = null;

            if (source === 'external') {
                await this.refreshActiveExternalSource();
            }
        },

        async setActiveExternalProvider(providerId: ExternalHistoryProviderId) {
            this.activeExternalProviderId = providerId;
            this.workspaceMode = 'active';
            this.previewConversation = null;
            this.currentError = null;

            if (this.historySource === 'external') {
                await this.refreshActiveExternalSource();
            }
        },

        async refreshActiveExternalSource() {
            const entry = this.resolveHistoryProviderEntry();
            if (!entry) {
                this.isExternalHistoryLoading = false;
                this.externalHistoryItems = [];
                return;
            }

            if (entry.kind === 'file-import') {
                this.isExternalHistoryLoading = false;
                this.externalHistoryItems = [];
                await this.openExternalFileImport();
                return;
            }

            await this.loadExternalHistory(entry.id);
        },

        async loadExternalHistory(providerId = this.activeExternalProviderId) {
            const provider = this.resolveHistoryProvider(providerId);
            if (!provider) {
                this.isExternalHistoryLoading = false;
                this.externalHistoryItems = [];
                return;
            }

            this.isExternalHistoryLoading = true;
            this.externalHistoryItems = [];
            try {
                const items = await provider.getHistoryList();
                this.externalHistoryItems = this.applyImportedFlags(items);
            } catch (error) {
                this.externalHistoryItems = [];
                this.currentError = formatHistoryError(error);
                throw error;
            } finally {
                this.isExternalHistoryLoading = false;
            }
        },

        async previewExternalConversation(providerId: ExternalHistoryProviderId, externalId: string) {
            const provider = this.resolveHistoryProvider(providerId);
            if (!provider) {
                throw new Error(`History provider '${providerId}' is not initialized`);
            }

            this.currentError = null;
            this.isExternalPreviewLoading = true;
            this.externalPreviewLoadingId = externalId;
            try {
                const conversation = await provider.getHistoryDetail(externalId);
                this.previewConversation = cloneConversation(conversation);
                this.workspaceMode = 'preview';
                this.historySource = 'external';
                this.activeExternalProviderId = providerId;
            } catch (error) {
                this.currentError = formatHistoryError(error);
                throw error;
            } finally {
                this.isExternalPreviewLoading = false;
                this.externalPreviewLoadingId = null;
            }
        },

        exitPreview() {
            this.workspaceMode = 'active';
            this.previewConversation = null;
            this.isExternalPreviewLoading = false;
            this.externalPreviewLoadingId = null;
            this.historySource = 'local';
        },

        async openExternalFileImport() {
            if (!this.externalFileImportHandler) {
                this.currentError = '当前宿主未注入文件导入能力。';
                return;
            }

            try {
                const result = await this.externalFileImportHandler();
                if (!result) {
                    return;
                }

                const importedItems = Array.isArray(result) ? result : [result];
                const normalizedImportedItems = importedItems.filter(Boolean);
                if (normalizedImportedItems.length === 0) {
                    return;
                }

                let activatedConversation: Conversation | null = null;
                for (const item of normalizedImportedItems) {
                    activatedConversation = await this.importConversation(item, 'external-file');
                }

                await this.loadLocalConversations();
                this.currentConversation = activatedConversation;
                this.workspaceMode = 'active';
                this.historySource = 'local';
                this.previewConversation = null;
                this.currentError = null;
                this.isQuestionIndexPanelOpen = true;
                await this.applyConversationModelSelection(this.currentConversation);
            } catch (error) {
                this.currentError = error instanceof Error ? error.message : '外部文件导入失败。';
                throw error;
            }
        },

        async importPreviewConversation() {
            if (!this.previewConversation) {
                return;
            }

            const importedConversation = await this.importConversation(
                this.previewConversation,
                this.activeExternalProviderId
            );

            await this.loadLocalConversations();
            if (this.resolveHistoryProvider()) {
                await this.loadExternalHistory().catch(() => undefined);
            }

            this.currentConversation = importedConversation;
            this.workspaceMode = 'active';
            this.historySource = 'local';
            this.previewConversation = null;
            this.currentError = null;
            this.isQuestionIndexPanelOpen = true;
            await this.applyConversationModelSelection(this.currentConversation);
        },

        async persistCurrentConversation() {
            if (!this.storageProvider || !this.currentConversation) {
                return;
            }

            this.currentConversation.updatedAt = Date.now();
            this.syncCurrentConversationModelSelection();
            await this.storageProvider.saveConversation(toRaw(this.currentConversation));
            await this.loadLocalConversations();
            if (this.resolveHistoryProvider() && this.externalHistoryItems.length > 0) {
                await this.loadExternalHistory().catch(() => undefined);
            }
        },

        async importConversation(preview: Conversation, defaultOrigin: ExternalHistoryProviderId): Promise<Conversation> {
            if (!this.storageProvider) {
                throw new Error('Storage provider is not initialized');
            }

            const previewOrigin = preview.origin && preview.origin !== 'local' ? preview.origin : defaultOrigin;
            const previewExternalId = preview.externalId || preview.backendId;
            const importKey = buildImportKey(previewOrigin, previewExternalId);
            const existingConversation = importKey
                ? this.conversations.find((conversation) => getImportedConversationKey(conversation) === importKey)
                : null;

            if (existingConversation) {
                return existingConversation;
            }

            const importedConversation: Conversation = {
                ...cloneConversation(preview),
                id: crypto.randomUUID(),
                origin: previewOrigin,
                externalId: previewExternalId,
                backendId: preview.backendId || preview.externalId,
                updatedAt: Date.now()
            };

            await this.storageProvider.saveConversation(toRaw(importedConversation));
            return importedConversation;
        },

        async sendMessage(prompt: string) {
            this.setDraftPrompt(prompt);
            await this.sendDraft();
        },

        async sendDraft() {
            if (this.workspaceMode === 'preview') {
                return;
            }

            const prompt = this.draftPrompt;
            const trimmedPrompt = prompt.trim();
            const pendingAttachments = this.draftAttachments.map((attachment) => ({ ...attachment }));
            if (!trimmedPrompt && pendingAttachments.length === 0) {
                return;
            }

            if (!this.currentConversation) {
                await this.startNewConversation();
            }

            if (!this.currentModelId) {
                throw new Error('Provider model catalog is not ready');
            }

            const history = this.currentConversation
                ? buildProviderHistory(this.currentConversation.messages)
                : [];

            const questionId = crypto.randomUUID();
            const createdAt = Date.now();
            const userMsgId = crypto.randomUUID();
            const assistantMsgId = crypto.randomUUID();

            this.currentConversation!.messages.push({
                id: userMsgId,
                role: 'user',
                content: trimmedPrompt,
                createdAt,
                questionId,
                attachments: pendingAttachments.length > 0 ? pendingAttachments : undefined
            });

            this.currentConversation!.messages.push({
                id: assistantMsgId,
                role: 'assistant',
                content: '',
                createdAt: createdAt + 1,
                questionId
            });

            this.isGenerating = true;
            this.isAbortRequested = false;
            this.currentError = null;
            this.attachmentError = null;
            this.lastSubmittedPrompt = prompt;
            this.draftPrompt = '';
            this.draftAttachments = [];

            try {
                const provider = this.resolveModelProvider();
                if (!provider || !this.storageProvider) {
                    throw new Error('Providers not initialized');
                }

                this.currentConversation!.origin = this.currentConversation!.origin || 'local';
                const backendId = this.currentConversation!.backendId;
                const modelOptions = cloneModelOptions(this.currentModelOptions);
                this.syncCurrentConversationModelSelection();

                const result = await provider.sendMessage(
                    trimmedPrompt,
                    {
                        context: { conversationId: backendId },
                        modelId: this.currentModelId,
                        attachments: pendingAttachments,
                        history,
                        modelOptions
                    },
                    (update) => {
                        const lastMsg = this.currentConversation!.messages[this.currentConversation!.messages.length - 1];
                        if (lastMsg.role === 'assistant') {
                            lastMsg.content = update.text;
                            lastMsg.annotations = update.annotations;
                        }
                    }
                );

                this.currentConversation!.backendId = result.conversationId;
                const lastMsg = this.currentConversation!.messages[this.currentConversation!.messages.length - 1];
                if (lastMsg.role === 'assistant') {
                    lastMsg.content = result.text;
                    lastMsg.annotations = result.annotations;
                }

                if (this.currentConversation!.title === 'New Chat') {
                    const seedTitle = trimmedPrompt || pendingAttachments[0]?.name || 'New Chat';
                    this.currentConversation!.title = seedTitle.substring(0, 30) + (seedTitle.length > 30 ? '...' : '');
                }

                await this.persistCurrentConversation();
            } catch (err: unknown) {
                if (this.isAbortRequested || isAbortError(err)) {
                    this.currentError = null;
                    await this.persistCurrentConversation();
                } else {
                    this.currentError = err instanceof Error ? err.message : 'Error sending message';
                }
            } finally {
                this.isGenerating = false;
                this.isAbortRequested = false;
                this.lastSubmittedPrompt = null;
            }
        },

        async queueAttachments(files: File[]) {
            if (!files.length) {
                return;
            }

            this.attachmentError = null;
            const nextAttachments: MessageAttachment[] = [];
            for (const file of files) {
                if (file.size > MAX_ATTACHMENT_SIZE) {
                    this.attachmentError = `单个附件不能超过 ${Math.floor(MAX_ATTACHMENT_SIZE / (1024 * 1024))}MB`;
                    continue;
                }

                nextAttachments.push(await fileToAttachment(file));
            }

            if (nextAttachments.length > 0) {
                this.draftAttachments = [...this.draftAttachments, ...nextAttachments];
            }
        },

        removeDraftAttachment(attachmentId: string) {
            this.draftAttachments = this.draftAttachments.filter((attachment) => attachment.id !== attachmentId);
        },

        clearDraftAttachments() {
            this.draftAttachments = [];
        },

        async toggleQuestionStar(questionId: string) {
            if (!this.currentConversation) {
                return;
            }

            const indices = resolveQuestionPairIndices(this.currentConversation.messages, questionId);
            const userIndex = indices.find((index) => this.currentConversation!.messages[index]?.role === 'user');
            if (userIndex === undefined) {
                return;
            }

            const userMessage = this.currentConversation.messages[userIndex];
            userMessage.starred = userMessage.starred !== true;
            await this.persistCurrentConversation();
        },

        async softDeleteQuestionPair(questionId: string) {
            if (!this.currentConversation) {
                return;
            }

            const indices = resolveQuestionPairIndices(this.currentConversation.messages, questionId);
            if (indices.length === 0) {
                return;
            }

            indices.forEach((index) => {
                this.currentConversation!.messages[index].deleted = true;
            });

            if (this.activeQuestionId === questionId) {
                this.activeQuestionId = null;
            }
            if (this.pendingScrollQuestionId === questionId) {
                this.pendingScrollQuestionId = null;
            }

            await this.persistCurrentConversation();
        },

        abortGeneration() {
            const provider = this.resolveModelProvider();
            if (provider) {
                provider.abort();
            }
            this.isAbortRequested = true;
            this.isGenerating = false;
            if (this.lastSubmittedPrompt !== null) {
                this.draftPrompt = this.lastSubmittedPrompt;
                this.draftFocusRequestKey += 1;
            }
        },

        applyImportedFlags(items: ConversationHistorySummary[]): ConversationHistorySummary[] {
            const importedKeys = new Set(
                this.conversations
                    .map((conversation) => getImportedConversationKey(conversation))
                    .filter((item): item is string => !!item)
            );

            return items.map((item) => ({
                ...item,
                isImported: importedKeys.has(buildImportKey(item.origin, item.id) || '')
            }));
        }
    }
});
