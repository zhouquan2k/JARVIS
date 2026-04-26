import { defineStore } from 'pinia';
import {
    prepareRequestWithActiveDocument,
    type AgentRuntime,
    cloneConversation,
    type Conversation,
    type ConversationArchiveStatus,
    type ConversationModelSelection,
    type ConversationMessage,
    type ConversationHistorySummary,
    cloneConversationMessage,
    ExternalHistoryError,
    type ExternalHistoryErrorCode,
    type ExternalHistoryProviderEntry,
    type ExternalHistoryProviderId,
    type HistoryListQueryOptions,
    type ContextDocument,
    type IConversationPersistProvider,
    type IContextProvider,
    type IExternalConversationProvider,
    type IModelProvider,
    type MessageAttachment,
    type ProviderDocumentCapability,
    type ResolvedAgentConfig,
    decodeTextDocument
} from '@packages/core/src';
import type { ModelConfig, ModelOptionDefinition, ProviderConfig, ProviderModelCatalog } from '@packages/core/config';
import { markRaw, toRaw } from 'vue';
import { translateWorkspaceMessage } from '../i18n';
import { executeConversationArchive, type ArchiveExecutionResult } from '../services/conversationArchive';
import { extractNodeNameFromPath } from '../utils/conversationTitle';

export type WorkspaceHistorySource = 'local' | 'external';
export type WorkspaceMode = 'agent' | 'conversation';
export type ExternalFileImportHandler = () => Promise<Conversation | Conversation[] | null>;
export type QuestionIndexFilter = 'all' | 'starred';
export type LocalConversationFilter = 'all' | 'starred';

type ProviderModelLoadState = {
    loading: boolean;
    loaded: boolean;
};

type ArchiveFeedbackTone = 'success' | 'info' | 'error';

export interface ArchiveFeedbackState {
    tone: ArchiveFeedbackTone;
    message: string;
}

export interface QuestionIndexItem {
    questionId: string;
    title: string;
    starred: boolean;
    deleted: boolean;
    messageId: string;
}

export interface ChatState {
    agentRuntime: AgentRuntime | null;
    modelProvider: IModelProvider | null;
    modelProviderResolver: ((providerId: string) => IModelProvider) | null;
    providerModelsResolver: ((providerId: string) => Promise<ProviderModelCatalog>) | null;
    storageProvider: IConversationPersistProvider | null;
    historyProviders: ExternalHistoryProviderEntry[];
    externalFileImportHandler: ExternalFileImportHandler | null;
    activeExternalProviderId: ExternalHistoryProviderId;
    providerCatalog: ProviderConfig[];
    availableProviders: ProviderConfig[];
    providerModelStates: Record<string, ProviderModelLoadState>;
    providerDocumentCapabilities: Record<string, ProviderDocumentCapability | null>;
    providerDocumentCapabilityLoading: Record<string, boolean>;
    conversations: Conversation[];
    currentConversation: Conversation | null;
    agentViewStatus: {
        selectedNodePath: string | null;
        activePath: string | null;
        activeConversationId: string | null;
    } | null;
    externalHistoryItems: ConversationHistorySummary[];
    externalHistoryQuery: string;
    externalHistoryQuerySubmitted: string;
    isExternalHistoryLoading: boolean;
    isExternalPreviewLoading: boolean;
    externalPreviewLoadingId: string | null;
    previewConversation: Conversation | null;
    historySource: WorkspaceHistorySource;
    workspaceMode: WorkspaceMode;
    sidebarCollapsed: boolean;
    localConversationFilter: LocalConversationFilter;
    isGenerating: boolean;
    isAbortRequested: boolean;
    currentError: string | null;
    currentHistoryErrorCode: ExternalHistoryErrorCode | null;
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
    activeAgentContext: ResolvedAgentConfig | null;
    workspaceAgentContext: ResolvedAgentConfig | null;
    activeWorkspaceAgentKey: string | null;
    activeWorkspacePath: string | null;
    activeWorkspaceSelectedNodePath: string | null;
    activeWorkspaceDocument: ContextDocument | null;
    activeWorkspaceContextProvider: IContextProvider | null;
    onWorkspaceFileChanged: ((change: { path: string; beforeContent: string; afterContent: string; alreadyPersisted?: boolean }) => Promise<void> | void) | null;
    isArchivingConversation: boolean;
    archiveFeedback: ArchiveFeedbackState | null;
    currentConversationArchiveStatus: ConversationArchiveStatus;
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

function cloneResolvedAgentConfig(agent: ResolvedAgentConfig): ResolvedAgentConfig {
    return {
        ...agent,
        sourcePaths: [...agent.sourcePaths],
        tools: agent.tools?.map((tool) => ({ ...tool })),
        skills: agent.skills?.map((skill) => ({ ...skill }))
    };
}

function cloneActiveWorkspaceDocument(
    document: ContextDocument | null | undefined
): ContextDocument | null {
    if (!document) {
        return null;
    }

    return {
        path: document.path,
        mimeType: document.mimeType,
        dataBase64: document.dataBase64,
        updatedAt: document.updatedAt,
        version: document.version,
        canWrite: document.canWrite
    };
}

function resolveProviderLabel(providerId: ExternalHistoryProviderId): string {
    switch (providerId) {
        case 'chatgpt-web':
            return translateWorkspaceMessage('provider.chatgptWeb');
        case 'gemini-web':
            return translateWorkspaceMessage('provider.geminiApi');
        case 'external-file':
            return translateWorkspaceMessage('shared.externalChatTitle');
        default:
            return providerId;
    }
}

function normalizeStoredConversation(conversation: Conversation): Conversation {
    const cloned = cloneConversation(conversation);
    if (cloned.origin === 'local') {
        cloned.agentKey = normalizeAgentScopeKey(cloned.agentKey);
    }
    return cloned;
}

function normalizeAgentScopeKey(agentKey: string | null | undefined): string | undefined {
    if (!agentKey || !agentKey.trim()) {
        return undefined;
    }

    const trimmed = agentKey.trim();
    if (trimmed === '__default__') {
        return '/';
    }

    if (!trimmed.endsWith('.agent.json')) {
        return trimmed;
    }

    const dir = trimmed.slice(0, -11);
    return dir.endsWith('/') ? dir : `${dir}/`;
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

    return message.attachments?.length ? translateWorkspaceMessage('shared.sendingAttachments') : translateWorkspaceMessage('shared.blankQuestion');
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

function resolveLastVisibleQuestionMessage(messages: ConversationMessage[]): ConversationMessage | null {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message.role === 'user' && message.deleted !== true) {
            return message;
        }
    }

    return null;
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
        content: message.content || message.requestSnapshot?.prompt || '',
        attachments: message.attachments?.length
            ? message.attachments.map((attachment) => ({ ...attachment }))
            : message.requestSnapshot?.attachments?.length
                ? message.requestSnapshot.attachments.map((attachment) => ({ ...attachment }))
                : undefined
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

function normalizeModelToken(value?: string | null): string {
    return value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '') || '';
}

function resolveProviderModelId(providerConfig: ProviderConfig, requestedModelId?: string | null): string | null {
    const normalizedRequested = requestedModelId?.trim();
    if (!normalizedRequested) {
        return null;
    }

    const exactIdMatch = providerConfig.models.find((model) => model.id === normalizedRequested);
    if (exactIdMatch) {
        return exactIdMatch.id;
    }

    const exactNameMatch = providerConfig.models.find((model) => model.name === normalizedRequested);
    if (exactNameMatch) {
        return exactNameMatch.id;
    }

    const normalizedRequestedToken = normalizeModelToken(normalizedRequested);
    if (!normalizedRequestedToken) {
        return null;
    }

    const normalizedMatch = providerConfig.models.find((model) => {
        return normalizeModelToken(model.id) === normalizedRequestedToken
            || normalizeModelToken(model.name) === normalizedRequestedToken;
    });
    if (normalizedMatch) {
        return normalizedMatch.id;
    }

    if (providerConfig.id === 'gemini-api' && normalizedRequestedToken === 'geminiprolatest') {
        const geminiProFallback = providerConfig.models.find((model) => {
            const normalizedId = normalizeModelToken(model.id);
            const normalizedName = normalizeModelToken(model.name);
            return normalizedId === 'gemini25pro'
                || normalizedName === 'gemini25pro'
                || normalizedId === 'geminiprolatest';
        });
        return geminiProFallback?.id || null;
    }

    return null;
}

function isConfiguredDefaultModelError(error: unknown): error is Error {
    return error instanceof Error && error.name === 'ConfiguredDefaultModelNotFoundError';
}

function formatHistoryError(error: unknown): string {
    if (error instanceof ExternalHistoryError) {
        switch (error.code) {
            case 'AUTH_REQUIRED':
                return error.message || translateWorkspaceMessage('shared.externalAuthRequired');
            case 'CONFIG_UNAVAILABLE':
                return error.message || translateWorkspaceMessage('shared.externalConfigUnavailable');
            case 'SELECTOR_MISMATCH':
                return error.message || translateWorkspaceMessage('shared.externalSelectorMismatch');
            case 'DETAIL_NOT_FOUND':
                return error.message || translateWorkspaceMessage('shared.externalDetailNotFound');
            case 'TAB_UNAVAILABLE':
                return error.message || translateWorkspaceMessage('shared.externalTabUnavailable');
            default:
                return error.message;
        }
    }

    return error instanceof Error ? error.message : translateWorkspaceMessage('shared.externalHistoryFailed');
}

function buildArchiveFeedbackMessage(result: ArchiveExecutionResult): string {
    if (!result.changed) {
        return translateWorkspaceMessage('shared.archiveConversationNoChange');
    }

    if (result.insertedDivider) {
        return [
            translateWorkspaceMessage('shared.archiveConversationSuccess'),
            translateWorkspaceMessage('shared.archiveConversationInsertedDivider')
        ].join(' ');
    }

    return translateWorkspaceMessage('shared.archiveConversationSuccess');
}

function extractHistoryErrorCode(error: unknown): ExternalHistoryErrorCode | null {
    return error instanceof ExternalHistoryError ? error.code : null;
}

function normalizeHistoryQuery(query: string | null | undefined): string {
    return query?.trim() || '';
}

function buildIdleConversationArchiveStatus(): ConversationArchiveStatus {
    return { state: 'idle' };
}

function resolveConversationArchiveStatus(
    conversation: Conversation | null,
    activeDocumentPath?: string | null
): ConversationArchiveStatus {
    if (!conversation || conversation.origin !== 'local' || !conversation.archive) {
        return buildIdleConversationArchiveStatus();
    }

    const visibleMessageCount = buildVisibleMessages(conversation.messages).length;
    const normalizedActiveDocumentPath = activeDocumentPath?.trim() || '';
    const matchesActiveDocument = !normalizedActiveDocumentPath || conversation.archive.documentPath === normalizedActiveDocumentPath;
    const isCurrentSnapshot = matchesActiveDocument && visibleMessageCount === conversation.archive.sourceMessageCount;

    return {
        state: isCurrentSnapshot ? 'archived' : 'stale',
        archivedAt: conversation.archive.archivedAt,
        documentPath: conversation.archive.documentPath,
        sourceMessageCount: conversation.archive.sourceMessageCount
    };
}

function getHistorySearchFeatures(entry: ExternalHistoryProviderEntry | null | undefined) {
    return entry?.features?.historySearch === true ? entry.features : null;
}

export const useChatStore = defineStore('chat', {
    state: (): ChatState => ({
        agentRuntime: null,
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
        providerDocumentCapabilities: {},
        providerDocumentCapabilityLoading: {},
        conversations: [],
        currentConversation: null,
        agentViewStatus: null,
        externalHistoryItems: [],
        externalHistoryQuery: '',
        externalHistoryQuerySubmitted: '',
        isExternalHistoryLoading: false,
        isExternalPreviewLoading: false,
        externalPreviewLoadingId: null,
        previewConversation: null,
        historySource: 'local',
        workspaceMode: 'conversation',
        sidebarCollapsed: false,
        localConversationFilter: 'all',
        isGenerating: false,
        isAbortRequested: false,
        currentError: null,
        currentHistoryErrorCode: null,
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
        attachmentError: null,
        activeAgentContext: null,
        workspaceAgentContext: null,
        activeWorkspaceAgentKey: null,
        activeWorkspacePath: null,
        activeWorkspaceSelectedNodePath: null,
        activeWorkspaceDocument: null,
        activeWorkspaceContextProvider: null,
        onWorkspaceFileChanged: null,
        isArchivingConversation: false,
        archiveFeedback: null,
        currentConversationArchiveStatus: buildIdleConversationArchiveStatus()
    }),

    getters: {
        displayConversation(state): Conversation | null {
            return state.previewConversation || state.currentConversation;
        },

        isPreviewing(state): boolean {
            return !!state.previewConversation;
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

        filteredLocalConversations(state): Conversation[] {
            return state.conversations.filter((conversation) => (
                state.localConversationFilter === 'all' || conversation.starred === true
            ));
        },

        questionIndexItems(state): QuestionIndexItem[] {
            if (state.previewConversation || !state.currentConversation) {
                return [];
            }

            return buildQuestionIndexItems(state.currentConversation.messages, state.questionIndexFilter);
        },

        visibleMessages(state): ConversationMessage[] {
            const conversation = state.previewConversation || state.currentConversation;
            if (!conversation) {
                return [];
            }

            return state.previewConversation
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
        },

        attachmentProviderId(state): string {
            return state.activeAgentContext?.modelProviderName?.trim() || state.currentProviderId;
        },

        currentProviderSupportsAttachments(): boolean {
            const providerId = this.attachmentProviderId;
            if (!providerId) {
                return false;
            }

            return (this.providerDocumentCapabilities[providerId]?.acceptedMimeTypes.length ?? 0) > 0;
        },

        isAttachmentCapabilityLoading(): boolean {
            const providerId = this.attachmentProviderId;
            return !!providerId && this.providerDocumentCapabilityLoading[providerId] === true;
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
            if (!this.currentConversation || this.isPreviewing || this.currentConversation.compare) {
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
            if (!conversation || this.isPreviewing) {
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

        resolveHistoryProviderEntry(providerId?: ExternalHistoryProviderId): ExternalHistoryProviderEntry | null {
            const targetProviderId = providerId ?? this.activeExternalProviderId;
            return this.historyProviders.find((entry) => entry.id === targetProviderId) || null;
        },

        resolveHistoryProvider(providerId?: ExternalHistoryProviderId): IExternalConversationProvider | null {
            const entry = this.resolveHistoryProviderEntry(providerId);
            return entry?.kind === 'history-provider' && entry.provider ? entry.provider : null;
        },

        resolveHistoryQueryOptions(
            providerId?: ExternalHistoryProviderId,
            options: HistoryListQueryOptions = {}
        ): HistoryListQueryOptions {
            const entry = this.resolveHistoryProviderEntry(providerId);
            if (!getHistorySearchFeatures(entry)) {
                return {};
            }

            if (Object.prototype.hasOwnProperty.call(options, 'query')) {
                return {
                    query: normalizeHistoryQuery(options.query)
                };
            }

            return {
                query: normalizeHistoryQuery(this.externalHistoryQuerySubmitted)
            };
        },

        setProviders(
            modelProvider: IModelProvider,
            storageProvider: IConversationPersistProvider,
            historyProvider?: IExternalConversationProvider
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

        setHistoryProvider(provider: IExternalConversationProvider) {
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

        setAgentRuntime(agentRuntime: AgentRuntime | null) {
            this.agentRuntime = agentRuntime ? markRaw(agentRuntime) : null;
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
            this.providerDocumentCapabilities = {};
            this.providerDocumentCapabilityLoading = {};

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

        async reloadProviderModels(providerId: string): Promise<ProviderConfig | null> {
            if (!providerId) {
                return null;
            }

            const provider = await this.loadProviderModels(providerId);
            if (!provider) {
                return null;
            }

            if (this.currentProviderId === providerId && provider.defaultModel) {
                const sourceOptions = this.currentConversation?.modelSelection?.providerId === providerId
                    && this.currentConversation.modelSelection.modelId === provider.defaultModel
                    ? this.currentConversation.modelSelection.modelOptions
                    : this.currentModelOptions;
                this.applyCurrentModelState(provider.defaultModel, sourceOptions);
            }

            return provider;
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

            const requestedModelId = resolveProviderModelId(provider, modelId);
            const nextModelId = requestedModelId || provider.defaultModel;
            const sourceOptions = this.currentConversation?.modelSelection?.providerId === providerId
                && this.currentConversation.modelSelection.modelId === nextModelId
                ? this.currentConversation.modelSelection.modelOptions
                : this.currentModelOptions;

            this.applyCurrentModelState(nextModelId, sourceOptions);
            await this.ensureAttachmentCapabilityLoaded(providerId);
            if (!this.currentProviderSupportsAttachments && this.draftAttachments.length > 0) {
                this.draftAttachments = [];
                this.setAttachmentUnsupportedError();
            }
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

        setAttachmentUnsupportedError() {
            this.attachmentError = translateWorkspaceMessage('shared.providerAttachmentsUnsupported');
        },

        async ensureAttachmentCapabilityLoaded(providerId?: string): Promise<void> {
            const targetProviderId = providerId || this.attachmentProviderId;
            if (!targetProviderId) {
                return;
            }

            if (
                Object.prototype.hasOwnProperty.call(this.providerDocumentCapabilities, targetProviderId)
                || this.providerDocumentCapabilityLoading[targetProviderId] === true
            ) {
                return;
            }

            this.providerDocumentCapabilityLoading = {
                ...this.providerDocumentCapabilityLoading,
                [targetProviderId]: true
            };

            try {
                const provider = this.resolveModelProvider(targetProviderId);
                const capability = await provider?.getDocumentCapability?.();
                this.providerDocumentCapabilities = {
                    ...this.providerDocumentCapabilities,
                    [targetProviderId]: capability
                        ? { acceptedMimeTypes: [...capability.acceptedMimeTypes] }
                        : null
                };
            } catch {
                this.providerDocumentCapabilities = {
                    ...this.providerDocumentCapabilities,
                    [targetProviderId]: null
                };
            } finally {
                this.providerDocumentCapabilityLoading = {
                    ...this.providerDocumentCapabilityLoading,
                    [targetProviderId]: false
                };
            }
        },

        setActiveAgentContext(agent: ResolvedAgentConfig | null) {
            this.activeAgentContext = agent ? cloneResolvedAgentConfig(agent) : null;
        },

        async applyActiveAgentContextSelection(agent?: ResolvedAgentConfig | null) {
            const targetAgent = agent ?? this.activeAgentContext;
            if (!targetAgent) {
                return;
            }

            const providerId = targetAgent.modelProviderName?.trim();
            if (!providerId) {
                return;
            }

            await this.setCurrentModelProvider(providerId, targetAgent.modelName?.trim() || undefined);
        },

        saveWorkspaceAgentContext(agent: ResolvedAgentConfig | null) {
            this.workspaceAgentContext = agent ? cloneResolvedAgentConfig(agent) : null;
        },

        clearWorkspaceAgentContext() {
            this.workspaceAgentContext = null;
        },

        setWorkspaceMode(mode: WorkspaceMode) {
            this.workspaceMode = mode;
        },

        resolveEffectiveAgentContext(): ResolvedAgentConfig | null {
            return this.activeAgentContext || this.workspaceAgentContext;
        },

        async applyWorkspaceAgentContextSelection() {
            const agent = this.workspaceAgentContext;
            if (!agent) {
                return;
            }

            const providerId = agent?.modelProviderName?.trim();
            if (!providerId) {
                return;
            }

            await this.setCurrentModelProvider(providerId, agent.modelName?.trim() || undefined);
        },

        setWorkspaceContext(input: {
            activeAgentKey?: string | null;
            selectedNodePath?: string | null;
            activePath: string | null;
            activeDocument?: ContextDocument | null;
            contextProvider: IContextProvider | null;
            onFileChanged?: ((change: { path: string; beforeContent: string; afterContent: string; alreadyPersisted?: boolean }) => Promise<void> | void) | null;
        }) {
            this.activeWorkspaceAgentKey = input.activeAgentKey ?? null;
            this.activeWorkspaceSelectedNodePath = input.selectedNodePath ?? null;
            this.activeWorkspacePath = input.activePath;
            this.activeWorkspaceDocument = cloneActiveWorkspaceDocument(input.activeDocument);
            this.activeWorkspaceContextProvider = input.contextProvider ? markRaw(input.contextProvider) : null;
            this.onWorkspaceFileChanged = input.onFileChanged ? markRaw(input.onFileChanged) : null;
            this.refreshCurrentConversationArchiveStatus();
        },

        resolveConversationBoundNodeName(input?: {
            selectedNodePath?: string | null;
            activePath?: string | null;
            activeDocumentPath?: string | null;
        }): string | undefined {
            const candidatePath = input?.selectedNodePath?.trim()
                || input?.activeDocumentPath?.trim()
                || input?.activePath?.trim()
                || this.agentViewStatus?.selectedNodePath?.trim()
                || this.agentViewStatus?.activePath?.trim()
                || null;

            return extractNodeNameFromPath(candidatePath) || undefined;
        },

        saveAgentViewStatus(input: {
            selectedNodePath: string | null;
            activePath: string | null;
            activeConversationId: string | null;
        }) {
            this.agentViewStatus = {
                selectedNodePath: input.selectedNodePath,
                activePath: input.activePath,
                activeConversationId: input.activeConversationId
            };
        },

        restoreAgentViewStatus() {
            return this.agentViewStatus
                ? { ...this.agentViewStatus }
                : null;
        },

        resolveConversationAgentKey(agentKey: string | null): string | undefined {
            return normalizeAgentScopeKey(agentKey);
        },

        applyConversationAgentKey(conversation: Conversation, agentKey: string | null): void {
            if (conversation.agentKey) {
                return;
            }

            const resolvedAgentKey = this.resolveConversationAgentKey(agentKey);
            if (resolvedAgentKey) {
                conversation.agentKey = resolvedAgentKey;
            }
        },

        async bindConversationToAgent(id: string, agentKey: string | null): Promise<void> {
            if (!this.storageProvider) {
                throw new Error('Storage provider is not initialized');
            }

            const targetConversation = this.conversations.find((conversation) => conversation.id === id)
                ?? (this.currentConversation?.id === id ? this.currentConversation : null);
            if (!targetConversation) {
                throw new Error(`Conversation ${id} not found`);
            }

            const nextConversation = normalizeStoredConversation({
                ...cloneConversation(targetConversation),
                updatedAt: Date.now()
            });

            const resolvedAgentKey = this.resolveConversationAgentKey(agentKey);
            if (resolvedAgentKey) {
                nextConversation.agentKey = resolvedAgentKey;
            } else {
                delete nextConversation.agentKey;
            }

            await this.storageProvider.saveConversation(toRaw(nextConversation));
            const syncProvider = this.storageProvider as IConversationPersistProvider & { syncNow?: () => Promise<void> };
            if (typeof syncProvider.syncNow === 'function') {
                await syncProvider.syncNow();
            }
            await this.loadLocalConversations();

            if (this.currentConversation?.id === id) {
                this.currentConversation = nextConversation;
            }
        },

        resolveConversationDocumentPath(path: string | null, document: ContextDocument | null): string | undefined {
            if (document?.path?.trim()) {
                return document.path.trim();
            }

            return typeof path === 'string' && path.trim() ? path.trim() : undefined;
        },

        applyConversationDocumentRelation(
            conversation: Conversation,
            input: {
                documentPath: string | null;
                activeDocument?: ContextDocument | null;
                requestSnapshot?: ConversationMessage['requestSnapshot'];
                isFirstTurn: boolean;
            }
        ): void {
            if (conversation.origin !== 'local' || !input.isFirstTurn) {
                return;
            }

            const normalizedDocumentPath = this.resolveConversationDocumentPath(
                input.documentPath,
                input.activeDocument ?? null
            );
            if (!normalizedDocumentPath) {
                return;
            }

            const hasActiveDocumentAttachment = input.requestSnapshot?.attachments?.some((attachment) => {
                return attachment.id === `active-document:${normalizedDocumentPath}`;
            }) === true;
            if (!hasActiveDocumentAttachment) {
                return;
            }

            const nextDocumentPaths = new Set(conversation.documentPaths ?? []);
            nextDocumentPaths.add(normalizedDocumentPath);
            conversation.documentPaths = Array.from(nextDocumentPaths);
        },

        getConversationsByAgent(agentKey: string): Conversation[] {
            const normalizedAgentKey = normalizeAgentScopeKey(agentKey);
            if (!normalizedAgentKey) {
                return [];
            }

            const persistedConversations = this.conversations.filter((conversation) => {
                return (
                    !conversation.compare
                    && !conversation.sync?.deleted
                    && normalizeAgentScopeKey(conversation.agentKey) === normalizedAgentKey
                );
            });

            const activeConversation = this.currentConversation;
            if (
                !activeConversation
                || activeConversation.compare
                || activeConversation.sync?.deleted
                || activeConversation.origin !== 'local'
                || normalizeAgentScopeKey(activeConversation.agentKey) !== normalizedAgentKey
                || persistedConversations.some((conversation) => conversation.id === activeConversation.id)
            ) {
                return persistedConversations;
            }

            return [activeConversation, ...persistedConversations];
        },

        async resolveSendTarget() {
            const requestedProviderId = this.activeAgentContext?.modelProviderName?.trim() || this.currentProviderId;
            if (!requestedProviderId) {
                throw new Error('No active model provider selected.');
            }

            const providerConfig = await this.ensureProviderModelsLoaded(requestedProviderId);
            if (!providerConfig) {
                throw new Error(`Provider '${requestedProviderId}' is unavailable.`);
            }

            const requestedModelId = this.activeAgentContext?.modelName?.trim();
            let resolvedModelId = providerConfig.defaultModel;
            if (requestedModelId) {
                const matchedModelId = resolveProviderModelId(providerConfig, requestedModelId);
                if (!matchedModelId) {
                    throw new Error(`Agent model '${requestedModelId}' is unavailable for provider '${requestedProviderId}'.`);
                }
                resolvedModelId = matchedModelId;
            } else if (
                requestedProviderId === this.currentProviderId
                && this.currentModelId
                && providerConfig.models.some((model) => model.id === this.currentModelId)
            ) {
                resolvedModelId = this.currentModelId;
            }

            const sourceOptions = requestedProviderId === this.currentProviderId && resolvedModelId === this.currentModelId
                ? this.currentModelOptions
                : this.currentConversation?.modelSelection?.providerId === requestedProviderId
                    && this.currentConversation.modelSelection.modelId === resolvedModelId
                    ? this.currentConversation.modelSelection.modelOptions
                    : {};

            const provider = this.resolveModelProvider(requestedProviderId);
            if (!provider) {
                throw new Error(`Provider '${requestedProviderId}' is not initialized.`);
            }

            return {
                provider,
                providerId: requestedProviderId,
                modelId: resolvedModelId,
                modelOptions: normalizeModelOptions(
                    resolveModelConfig(providerConfig, resolvedModelId),
                    sourceOptions
                )
            };
        },

        clearArchiveFeedback() {
            this.archiveFeedback = null;
        },

        refreshCurrentConversationArchiveStatus(): void {
            this.currentConversationArchiveStatus = resolveConversationArchiveStatus(
                this.currentConversation,
                this.activeWorkspaceDocument?.path
            );
        },

        async markCurrentConversationArchived(input: {
            documentPath: string;
            sourceMessageCount: number;
            archivedAt: number;
        }): Promise<void> {
            if (!this.currentConversation || this.currentConversation.origin !== 'local') {
                return;
            }

            this.currentConversation.archive = {
                documentPath: input.documentPath,
                archivedAt: input.archivedAt,
                sourceMessageCount: input.sourceMessageCount
            };
            this.refreshCurrentConversationArchiveStatus();
            await this.persistCurrentConversation();
        },

        canArchiveCurrentConversation(): boolean {
            const activeDocument = this.activeWorkspaceDocument;
            if (
                this.workspaceMode !== 'agent'
                || this.isPreviewing
                || this.currentConversation?.origin !== 'local'
                || !activeDocument
                || activeDocument.mimeType !== 'text/markdown'
                || activeDocument.canWrite === false
                || !this.currentConversation
                || this.visibleMessages.length === 0
            ) {
                return false;
            }

            const selectedNodePath = this.activeWorkspaceSelectedNodePath?.trim() || '';
            const activeDocumentPath = activeDocument.path?.trim() || '';
            return !!selectedNodePath && !!activeDocumentPath && selectedNodePath === activeDocumentPath;
        },

        async archiveCurrentConversationToDocument(): Promise<void> {
            if (!this.canArchiveCurrentConversation()) {
                return;
            }

            const activeDocument = this.activeWorkspaceDocument;
            const onWorkspaceFileChanged = this.onWorkspaceFileChanged;
            if (!activeDocument || !onWorkspaceFileChanged) {
                this.archiveFeedback = {
                    tone: 'error',
                    message: translateWorkspaceMessage('shared.archiveConversationFailed', {
                        reason: 'Workspace file change pipeline is unavailable.'
                    })
                };
                return;
            }

            const beforeContent = decodeTextDocument(activeDocument.dataBase64);
            this.isArchivingConversation = true;
            this.archiveFeedback = null;

            try {
                const sendTarget = await this.resolveSendTarget();
                const result = await executeConversationArchive({
                    provider: sendTarget.provider,
                    modelId: sendTarget.modelId,
                    modelOptions: sendTarget.modelOptions,
                    documentMarkdown: beforeContent,
                    messages: this.visibleMessages
                });

                if (result.changed) {
                    await onWorkspaceFileChanged({
                        path: activeDocument.path,
                        beforeContent,
                        afterContent: result.nextDocument
                    });
                }

                await this.markCurrentConversationArchived({
                    documentPath: activeDocument.path,
                    sourceMessageCount: this.visibleMessages.length,
                    archivedAt: Date.now()
                });

                this.archiveFeedback = {
                    tone: result.changed ? 'success' : 'info',
                    message: buildArchiveFeedbackMessage(result)
                };
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                this.archiveFeedback = {
                    tone: 'error',
                    message: translateWorkspaceMessage('shared.archiveConversationFailed', { reason })
                };
            } finally {
                this.isArchivingConversation = false;
            }
        },

        setQuestionIndexFilter(filter: QuestionIndexFilter) {
            this.questionIndexFilter = filter;
        },

        setLocalConversationFilter(filter: LocalConversationFilter) {
            this.localConversationFilter = filter;
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
            this.refreshCurrentConversationArchiveStatus();

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
            this.refreshCurrentConversationArchiveStatus();
        },

        async selectLocalConversation(id: string) {
            await this.loadConversation(id);
            this.historySource = 'local';
            this.previewConversation = null;
            this.currentError = null;
            this.isQuestionIndexPanelOpen = true;
            this.activeQuestionId = null;
            this.pendingScrollQuestionId = null;
            this.refreshCurrentConversationArchiveStatus();
            await this.applyConversationModelSelection(this.currentConversation);
        },

        async activateConversationSnapshot(conversation: Conversation) {
            if (conversation.compare || conversation.sync?.deleted) {
                return;
            }

            this.currentConversation = normalizeStoredConversation(conversation);
            this.historySource = 'local';
            this.previewConversation = null;
            this.currentError = null;
            this.currentHistoryErrorCode = null;
            this.isExternalPreviewLoading = false;
            this.externalPreviewLoadingId = null;
            this.isQuestionIndexPanelOpen = true;
            this.activeQuestionId = null;
            this.pendingScrollQuestionId = null;
            this.refreshCurrentConversationArchiveStatus();
            await this.applyConversationModelSelection(this.currentConversation);
        },

        async deleteLocalConversation(id: string) {
            if (!this.storageProvider) {
                return;
            }

            const isDeletingCurrentConversation = !this.isPreviewing && this.currentConversation?.id === id;

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

        async toggleConversationStar(id: string) {
            if (!this.storageProvider) {
                return;
            }

            const targetConversation = this.conversations.find((conversation) => conversation.id === id)
                ?? (this.currentConversation?.id === id ? this.currentConversation : null);
            if (!targetConversation) {
                return;
            }

            const nextConversation = normalizeStoredConversation({
                ...cloneConversation(targetConversation),
                starred: targetConversation.starred === true ? undefined : true,
                updatedAt: Date.now()
            });

            await this.storageProvider.saveConversation(toRaw(nextConversation));
            await this.loadLocalConversations();

            if (this.currentConversation?.id === id) {
                this.currentConversation = nextConversation;
            }
        },

        async startNewConversation(input?: { boundNodeName?: string | null }) {
            const isConversationMode = this.workspaceMode === 'conversation';
            const hasWorkspaceAgentContext = this.workspaceAgentContext !== null;
            const shouldClearConversationWorkspaceContext = isConversationMode && input !== undefined;
            if (shouldClearConversationWorkspaceContext) {
                this.setActiveAgentContext(null);
                this.clearWorkspaceAgentContext();
                this.setWorkspaceContext({
                    activeAgentKey: null,
                    selectedNodePath: null,
                    activePath: null,
                    activeDocument: null,
                    contextProvider: null,
                    onFileChanged: null
                });
            }

            const explicitBoundNodeName = typeof input?.boundNodeName === 'string' && input.boundNodeName.trim()
                ? input.boundNodeName.trim()
                : undefined;
            const boundNodeName = explicitBoundNodeName
                ?? (shouldClearConversationWorkspaceContext ? undefined : this.resolveConversationBoundNodeName());
            this.currentConversation = {
                id: crypto.randomUUID(),
                title: 'New Chat',
                boundNodeName,
                origin: 'local',
                messages: [],
                updatedAt: Date.now(),
                modelSelection: this.buildCurrentConversationModelSelection()
            };
            this.historySource = 'local';
            this.previewConversation = null;
            this.currentError = null;
            this.isQuestionIndexPanelOpen = true;
            this.activeQuestionId = null;
            this.pendingScrollQuestionId = null;
            this.refreshCurrentConversationArchiveStatus();

            if (hasWorkspaceAgentContext) {
                const defaultProviderId = this.availableProviders[0]?.id || '';
                if (defaultProviderId) {
                    await this.setCurrentModelProvider(defaultProviderId);
                } else {
                    this.currentProviderId = '';
                    this.currentModelId = '';
                    this.currentModelOptions = {};
                }
            }

            this.syncCurrentConversationModelSelection();
        },

        setSidebarCollapsed(collapsed: boolean) {
            this.sidebarCollapsed = collapsed;
        },

        resetWorkspaceConversationState() {
            this.previewConversation = null;
            this.historySource = 'local';
            this.currentError = null;
            this.currentHistoryErrorCode = null;
            this.isExternalPreviewLoading = false;
            this.externalPreviewLoadingId = null;
            this.isQuestionIndexPanelOpen = true;
            this.activeQuestionId = null;
            this.pendingScrollQuestionId = null;
            this.draftPrompt = '';
            this.lastSubmittedPrompt = null;
            this.draftAttachments = [];
            this.attachmentError = null;
        },

        clearWorkspaceConversationSelection() {
            this.currentConversation = null;
            this.previewConversation = null;
            this.historySource = 'local';
            this.currentError = null;
            this.currentHistoryErrorCode = null;
            this.isExternalPreviewLoading = false;
            this.externalPreviewLoadingId = null;
            this.isQuestionIndexPanelOpen = true;
            this.activeQuestionId = null;
            this.pendingScrollQuestionId = null;
            this.refreshCurrentConversationArchiveStatus();
        },

        setExternalHistoryQuery(query: string) {
            this.externalHistoryQuery = query;
        },

        async submitExternalHistoryQuery(query?: string) {
            if (typeof query === 'string') {
                this.externalHistoryQuery = query;
            }

            this.externalHistoryQuerySubmitted = normalizeHistoryQuery(this.externalHistoryQuery);
            if (this.historySource !== 'external') {
                return;
            }

            const entry = this.resolveHistoryProviderEntry();
            if (!getHistorySearchFeatures(entry) || entry?.kind !== 'history-provider') {
                return;
            }

            await this.loadExternalHistory(entry.id, {
                query: this.externalHistoryQuerySubmitted
            });
        },

        async clearExternalHistoryQuery() {
            this.externalHistoryQuery = '';
            this.externalHistoryQuerySubmitted = '';

            if (this.historySource !== 'external') {
                return;
            }

            const entry = this.resolveHistoryProviderEntry();
            if (!getHistorySearchFeatures(entry) || entry?.kind !== 'history-provider') {
                return;
            }

            await this.loadExternalHistory(entry.id, {
                query: ''
            });
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
            this.previewConversation = null;
            this.currentError = null;
            this.currentHistoryErrorCode = null;

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

        async loadExternalHistory(providerId?: ExternalHistoryProviderId, options: HistoryListQueryOptions = {}) {
            const provider = this.resolveHistoryProvider(providerId);
            if (!provider) {
                this.isExternalHistoryLoading = false;
                this.externalHistoryItems = [];
                return;
            }

            const queryOptions = this.resolveHistoryQueryOptions(providerId, options);
            this.isExternalHistoryLoading = true;
            this.externalHistoryItems = [];
            this.currentHistoryErrorCode = null;
            try {
                const items = await provider.getHistoryList(queryOptions);
                this.externalHistoryItems = this.applyImportedFlags(items);
                this.currentHistoryErrorCode = null;
                if (providerId === 'gemini-web') {
                    this.currentHistoryErrorCode = null;
                    this.currentError = null;
                }
            } catch (error) {
                this.externalHistoryItems = [];
                this.currentHistoryErrorCode = extractHistoryErrorCode(error);
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
            this.currentHistoryErrorCode = null;
            this.isExternalPreviewLoading = true;
            this.externalPreviewLoadingId = externalId;
            try {
                const conversation = await provider.getHistoryDetail(externalId);
                this.previewConversation = cloneConversation(conversation);
                this.historySource = 'external';
                this.activeExternalProviderId = providerId;
                this.currentHistoryErrorCode = null;
            } catch (error) {
                this.currentHistoryErrorCode = extractHistoryErrorCode(error);
                this.currentError = formatHistoryError(error);
                throw error;
            } finally {
                this.isExternalPreviewLoading = false;
                this.externalPreviewLoadingId = null;
            }
        },

        exitPreview() {
            this.previewConversation = null;
            this.isExternalPreviewLoading = false;
            this.externalPreviewLoadingId = null;
            this.historySource = 'local';
        },

        async openExternalFileImport() {
            if (!this.externalFileImportHandler) {
                this.currentError = translateWorkspaceMessage('shared.currentHostUnavailable');
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
                this.historySource = 'local';
                this.previewConversation = null;
                this.currentError = null;
                this.isQuestionIndexPanelOpen = true;
                this.refreshCurrentConversationArchiveStatus();
                await this.applyConversationModelSelection(this.currentConversation);
            } catch (error) {
                this.currentError = error instanceof Error ? error.message : translateWorkspaceMessage('shared.fileImportFailed');
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
            this.historySource = 'local';
            this.previewConversation = null;
            this.currentError = null;
            this.isQuestionIndexPanelOpen = true;
            this.refreshCurrentConversationArchiveStatus();
            await this.applyConversationModelSelection(this.currentConversation);
        },

        async persistCurrentConversation(input: { syncModelSelection?: boolean } = {}) {
            if (!this.storageProvider || !this.currentConversation) {
                return;
            }

            this.currentConversation.updatedAt = Date.now();
            if (input.syncModelSelection !== false) {
                this.syncCurrentConversationModelSelection();
            }
            await this.storageProvider.saveConversation(toRaw(this.currentConversation));
            await this.loadLocalConversations();
            this.refreshCurrentConversationArchiveStatus();
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
            if (this.isPreviewing) {
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
            const isFirstTurn = history.length === 0;
            const agentContext = this.activeAgentContext;
            const shouldAutoAttachActiveDocument = !!agentContext && history.length === 0;
            const activeDocumentForRequest = shouldAutoAttachActiveDocument
                ? this.activeWorkspaceDocument
                : null;
            const requestDocumentPath = this.resolveConversationDocumentPath(this.activeWorkspacePath, activeDocumentForRequest);
            const requestProviderId = agentContext?.modelProviderName?.trim() || this.currentProviderId;
            const requestProvider = requestProviderId
                ? this.resolveModelProvider(requestProviderId)
                : null;
            const initialPreparedRequest = agentContext && requestProvider
                ? await prepareRequestWithActiveDocument(
                    requestProvider,
                    trimmedPrompt,
                    {
                        activeDocument: activeDocumentForRequest,
                        attachments: pendingAttachments
                    }
                )
                : {
                    prompt: trimmedPrompt,
                    attachments: pendingAttachments,
                    mode: 'none' as const
                };

            const questionId = crypto.randomUUID();
            const createdAt = Date.now();
            const userMsgId = crypto.randomUUID();
            const assistantMsgId = crypto.randomUUID();

            this.currentConversation!.messages.push({
                id: userMsgId,
                role: 'user',
                content: initialPreparedRequest.prompt,
                createdAt,
                questionId,
                attachments: initialPreparedRequest.attachments.length > 0
                    ? initialPreparedRequest.attachments.map((attachment) => ({ ...attachment }))
                    : undefined,
                requestSnapshot: {
                    prompt: initialPreparedRequest.prompt,
                    attachments: initialPreparedRequest.attachments.map((attachment) => ({ ...attachment })),
                    activeDocumentMode: initialPreparedRequest.mode
                }
            });

            this.currentConversation!.messages.push({
                id: assistantMsgId,
                role: 'assistant',
                content: '',
                createdAt: createdAt + 1,
                questionId
            });
            this.refreshCurrentConversationArchiveStatus();

            this.isGenerating = true;
            this.isAbortRequested = false;
            this.currentError = null;
            this.attachmentError = null;
            this.lastSubmittedPrompt = prompt;
            this.draftPrompt = '';
            this.draftAttachments = [];

            try {
                const sendTarget = await this.resolveSendTarget();
                if (!this.storageProvider) {
                    throw new Error('Providers not initialized');
                }
                if (this.isAbortRequested) {
                    const abortError = new Error('Aborted');
                    abortError.name = 'AbortError';
                    throw abortError;
                }

                this.currentConversation!.origin = this.currentConversation!.origin || 'local';
                const backendId = this.currentConversation!.backendId;
                this.currentConversation!.modelSelection = buildConversationModelSelection(
                    sendTarget.providerId,
                    sendTarget.modelId,
                    sendTarget.modelOptions
                );
                const onUpdate = (update: { text: string, annotations?: ConversationMessage['annotations'] }) => {
                    const lastMsg = this.currentConversation!.messages[this.currentConversation!.messages.length - 1];
                    if (lastMsg.role === 'assistant') {
                        lastMsg.content = update.text;
                        lastMsg.annotations = update.annotations;
                    }
                };
                const result = this.agentRuntime
                    ? await this.agentRuntime.run(
                        {
                            prompt: trimmedPrompt,
                            agent: agentContext,
                            workspace: {
                                activePath: this.activeWorkspacePath,
                                activeDocument: activeDocumentForRequest,
                                contextProvider: this.activeWorkspaceContextProvider,
                                onFileChanged: this.onWorkspaceFileChanged ?? undefined
                            },
                            providerId: sendTarget.providerId,
                            modelId: sendTarget.modelId,
                            attachments: pendingAttachments,
                            history,
                            modelOptions: cloneModelOptions(sendTarget.modelOptions),
                            context: { conversationId: backendId }
                        },
                        onUpdate
                    )
                    : await (async () => {
                        const preparedRequest = agentContext
                            ? await prepareRequestWithActiveDocument(
                                sendTarget.provider,
                                trimmedPrompt,
                                {
                                    activeDocument: activeDocumentForRequest,
                                    attachments: pendingAttachments
                                }
                            )
                            : {
                                prompt: trimmedPrompt,
                                attachments: pendingAttachments,
                                mode: 'none' as const
                            };

                        const providerResult = await sendTarget.provider.sendMessage(
                            preparedRequest.prompt,
                            {
                                context: { conversationId: backendId },
                                modelId: sendTarget.modelId,
                                attachments: preparedRequest.attachments,
                                history,
                                modelOptions: cloneModelOptions(sendTarget.modelOptions)
                            },
                            onUpdate
                        );
                        return {
                            ...providerResult,
                            requestSnapshot: {
                                prompt: preparedRequest.prompt,
                                attachments: preparedRequest.attachments.map((attachment) => ({ ...attachment })),
                                activeDocumentMode: preparedRequest.mode
                            }
                        };
                    })();

                this.currentConversation!.backendId = result.conversationId;
                const userMsg = this.currentConversation!.messages.find((message) => message.id === userMsgId);
                if (userMsg?.role === 'user') {
                    userMsg.content = result.requestSnapshot?.prompt ?? userMsg.content;
                    userMsg.attachments = result.requestSnapshot?.attachments?.length
                        ? result.requestSnapshot.attachments.map((attachment) => ({ ...attachment }))
                        : pendingAttachments.length > 0
                            ? pendingAttachments.map((attachment) => ({ ...attachment }))
                            : undefined;
                    userMsg.requestSnapshot = result.requestSnapshot
                        ? {
                            prompt: result.requestSnapshot.prompt,
                            attachments: result.requestSnapshot.attachments?.map((attachment) => ({ ...attachment })),
                            activeDocumentMode: result.requestSnapshot.activeDocumentMode
                        }
                        : undefined;
                }
                const lastMsg = this.currentConversation!.messages[this.currentConversation!.messages.length - 1];
                if (lastMsg.role === 'assistant') {
                    lastMsg.content = result.text;
                    lastMsg.annotations = result.annotations;
                }

                if (this.currentConversation!.title === 'New Chat') {
                    const seedTitle = trimmedPrompt || pendingAttachments[0]?.name || 'New Chat';
                    this.currentConversation!.title = seedTitle.substring(0, 30) + (seedTitle.length > 30 ? '...' : '');
                }

                this.applyConversationAgentKey(this.currentConversation!, this.activeWorkspaceAgentKey);
                this.applyConversationDocumentRelation(this.currentConversation!, {
                    documentPath: requestDocumentPath ?? null,
                    activeDocument: activeDocumentForRequest,
                    requestSnapshot: userMsg?.requestSnapshot,
                    isFirstTurn
                });
                await this.persistCurrentConversation({ syncModelSelection: false });
            } catch (err: unknown) {
                if (this.isAbortRequested || isAbortError(err)) {
                    this.currentError = null;
                    this.applyConversationAgentKey(this.currentConversation!, this.activeWorkspaceAgentKey);
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
            await this.ensureAttachmentCapabilityLoaded();
            if (!this.currentProviderSupportsAttachments) {
                this.setAttachmentUnsupportedError();
                return;
            }

            const nextAttachments: MessageAttachment[] = [];
            for (const file of files) {
                if (file.size > MAX_ATTACHMENT_SIZE) {
                    this.attachmentError = translateWorkspaceMessage('shared.attachmentsLimitExceeded', {
                        maxSizeMB: Math.floor(MAX_ATTACHMENT_SIZE / (1024 * 1024))
                    });
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

            const lastVisibleQuestion = resolveLastVisibleQuestionMessage(this.currentConversation.messages);
            if (lastVisibleQuestion && getQuestionKey(lastVisibleQuestion) === questionId) {
                this.draftPrompt = lastVisibleQuestion.content || lastVisibleQuestion.requestSnapshot?.prompt || '';
                this.draftFocusRequestKey += 1;
            }

            indices.forEach((index) => {
                this.currentConversation!.messages[index].deleted = true;
            });
            this.refreshCurrentConversationArchiveStatus();

            if (this.activeQuestionId === questionId) {
                this.activeQuestionId = null;
            }
            if (this.pendingScrollQuestionId === questionId) {
                this.pendingScrollQuestionId = null;
            }

            await this.persistCurrentConversation();
        },

        abortGeneration() {
            if (this.agentRuntime) {
                this.agentRuntime.abort();
            } else {
                const provider = this.resolveModelProvider(this.activeAgentContext?.modelProviderName?.trim() || this.currentProviderId);
                if (provider) {
                    provider.abort();
                }
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
