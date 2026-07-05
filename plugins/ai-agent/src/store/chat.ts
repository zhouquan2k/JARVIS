import { defineStore } from 'pinia';
import {
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
    type ContextNode,
    type IConversationPersistProvider,
    type IContextProvider,
    type IExternalConversationProvider,
    type IModelProvider,
    type MessageAttachment,
    type MessageFunctionalPart,
    type ProviderDocumentCapability,
    type ReasoningEffort,
    type ResolvedAgentConfig,
    decodeTextDocument,
    isTextDocumentMimeType
} from '@plugins/ai-agent/src/internal';
import {
    resolveLightweightModelSelection,
    type ModelConfig,
    type ModelOptionDefinition,
    type ProviderConfig,
    type ProviderModelCatalog,
    type RuntimeMode
} from '@packages/core/config';
import type { ControlledPageCapability } from '@packages/core';
import { markRaw, toRaw } from 'vue';
import { translateWorkspaceMessage } from '@packages/ui';
import { executeConversationArchive, type ArchiveExecutionResult } from '../services/conversationArchive';
import { buildFallbackConversationTitle, extractNodeNameFromPath, sanitizeConversationTitle } from '../utils/conversationTitle';
import { formatHttpApiError } from '@packages/ui';
import { augmentPromptWithMentionedFiles, prepareRequestWithActiveDocument } from '../runtime/agents/augmentPromptWithAgentContext';
import { resolveAllScopedAgentConfigsFromWorkspaceContext } from '../runtime/agents/config/resolveScopedAgentConfig';
import type { AgentRuntime } from '../runtime/agents/runtime/types';
import { resolveGroupMembers, resolveGroupCandidates } from '../providers/model/MultiModelGroupProvider';
import type { GroupMember } from '../group/groupTypes';

const GROUP_PROVIDER_ID = 'group';
const GROUP_DEFAULT_PRESET_ID = 'dom';

export type WorkspaceHistorySource = 'local' | 'external';
export type WorkspaceMode = 'agent' | 'conversation';
export type ExternalFileImportHandler = () => Promise<Conversation | Conversation[] | null>;
export type QuestionIndexFilter = 'all' | 'starred';
export type LocalConversationFilter = 'all' | 'starred';

type ProviderModelLoadState = {
    loading: boolean;
    loaded: boolean;
};

type ResolvedMentionedContextDocument = {
    path: string;
    name: string;
    document: ContextDocument;
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
    controlledPageCapability: ControlledPageCapability | null;
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
    currentReasoningEffort: ReasoningEffort;
    /** 当前模型选择是否为用户在下拉框主动选择（优先于 agent 默认模型）。 */
    currentModelSelectionExplicit: boolean;
    /** group provider 当前勾选参与的成员（顶部勾选区状态，仅 group 模式有意义）。 */
    currentGroupMembers: GroupMember[];
    questionIndexFilter: QuestionIndexFilter;
    isQuestionIndexPanelOpen: boolean;
    activeQuestionId: string | null;
    pendingScrollQuestionId: string | null;
    editingQuestionId: string | null;
    draftPrompt: string;
    lastSubmittedPrompt: string | null;
    draftFocusRequestKey: number;
    draftAttachments: MessageAttachment[];
    attachmentError: string | null;
    activeAgentContext: ResolvedAgentConfig | null;
    workspaceAgentContext: ResolvedAgentConfig | null;
    conversationContextProvider: IContextProvider | null;
    conversationAgentConfigs: Record<string, ResolvedAgentConfig>;
    conversationOnFileChanged: ((change: { path: string; beforeContent: string; afterContent: string; alreadyPersisted?: boolean }) => Promise<void> | void) | null;
    activeWorkspaceAgentKey: string | null;
    activeWorkspacePath: string | null;
    activeWorkspaceSelectedNodePath: string | null;
    activeWorkspaceDocument: ContextDocument | null;
    activeWorkspaceContextProvider: IContextProvider | null;
    onWorkspaceFileChanged: ((change: { path: string; beforeContent: string; afterContent: string; alreadyPersisted?: boolean }) => Promise<void> | void) | null;
    isArchivingConversation: boolean;
    archiveFeedback: ArchiveFeedbackState | null;
    archiveConversationProgressPart: MessageFunctionalPart | null;
    currentConversationArchiveStatus: ConversationArchiveStatus;
    runtimeMode: RuntimeMode;
}

// dom provider 受控页的站点首页（用于全新窗口的登录/查看导航）。
const DOM_PROVIDER_SITE_URLS: Record<string, string> = {
    'chatgpt-dom': 'https://chatgpt.com',
    'gemini-dom': 'https://gemini.google.com/app'
};

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'high';
const NEW_CHAT_TITLE = 'New Chat';
const LAST_LOCAL_CONVERSATION_STORAGE_KEY = 'jarvis:chat:last-local-conversation-id';
const FILE_REFERENCE_PATTERN = /(^|[\s([{\u3000\uFF08\u3010])@([^\s@]+)/gu;
const TRAILING_MENTION_PUNCTUATION = /[.,;:!?)\]}>\u3001\u3002\uFF0C\uFF1B\uFF1A\uFF01\uFF1F\uFF09\u3011\u300B]+$/u;
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

function createRuntimeUuid(): string {
    const randomUuid = globalThis.crypto?.randomUUID;
    if (typeof randomUuid === 'function') {
        return randomUuid.call(globalThis.crypto);
    }

    return `chatprism-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getBrowserStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
    if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
        return null;
    }

    try {
        return globalThis.localStorage;
    } catch {
        return null;
    }
}

function readLastLocalConversationId(): string | null {
    const storage = getBrowserStorage();
    const value = storage?.getItem(LAST_LOCAL_CONVERSATION_STORAGE_KEY)?.trim();
    return value || null;
}

function writeLastLocalConversationId(id: string | null): void {
    const storage = getBrowserStorage();
    if (!storage) {
        return;
    }

    if (id && id.trim()) {
        storage.setItem(LAST_LOCAL_CONVERSATION_STORAGE_KEY, id.trim());
        return;
    }

    storage.removeItem(LAST_LOCAL_CONVERSATION_STORAGE_KEY);
}

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
        id: createRuntimeUuid(),
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
        sourcePaths: Array.isArray(agent.sourcePaths) ? [...agent.sourcePaths] : [],
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
        canWrite: document.canWrite,
        documentId: document.documentId
    };
}

function normalizeContextPath(path?: string | null): string | null {
    const trimmed = path?.trim();
    if (!trimmed) {
        return null;
    }

    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    const normalized = withLeadingSlash.replace(/\/+/g, '/').replace(/\/$/, '');
    return normalized || '/';
}

function extractMentionedFileRefToken(token: string): string | null {
    const trimmed = token.trim().replace(TRAILING_MENTION_PUNCTUATION, '');
    if (!trimmed) {
        return null;
    }

    return trimmed.replace(/^\.?\//u, '');
}

function extractMentionedFileRefs(prompt: string, excludedLowerNames?: ReadonlySet<string>): string[] {
    const matches = prompt.matchAll(FILE_REFERENCE_PATTERN);
    const refs: string[] = [];

    for (const match of matches) {
        const token = typeof match[2] === 'string' ? extractMentionedFileRefToken(match[2]) : null;
        // group 会话里命中成员名的 @token 是「成员定向」而非文件引用，需从文件解析中排除，
        // 否则会被当成不存在的文件而抛 "Referenced file '@xxx' was not found"。
        if (token && !excludedLowerNames?.has(token.toLowerCase())) {
            refs.push(token);
        }
    }

    return refs;
}

function flattenContextFileNodes(nodes: ContextNode[]): ContextNode[] {
    const files: ContextNode[] = [];

    for (const node of nodes) {
        if (node.kind === 'file') {
            files.push(node);
        }

        if (Array.isArray(node.children) && node.children.length > 0) {
            files.push(...flattenContextFileNodes(node.children));
        }
    }

    return files;
}

function buildMentionedFileError(ref: string, reason: 'missing' | 'ambiguous' | 'non-text'): Error {
    switch (reason) {
        case 'missing':
            return new Error(`Referenced file '@${ref}' was not found in the current Agent context.`);
        case 'ambiguous':
            return new Error(`Referenced file '@${ref}' matches multiple files in the current Agent context. Please use a more specific path suffix.`);
        case 'non-text':
            return new Error(`Referenced file '@${ref}' is not a text document and cannot be injected into the prompt.`);
        default:
            return new Error(`Referenced file '@${ref}' could not be loaded.`);
    }
}

function resolveMentionCandidateByReference(ref: string, nodes: ContextNode[]): ContextNode | null {
    const normalizedRef = extractMentionedFileRefToken(ref);
    if (!normalizedRef) {
        return null;
    }

    const normalizedRefPath = normalizeContextPath(normalizedRef);
    const basename = normalizedRef.split('/').pop() || normalizedRef;
    const basenameMatches = nodes.filter((node) => node.name === basename);
    if (basenameMatches.length === 1) {
        return basenameMatches[0];
    }

    if (normalizedRefPath) {
        const suffixMatches = nodes.filter((node) => {
            const normalizedNodePath = normalizeContextPath(node.path);
            return normalizedNodePath === normalizedRefPath
                || normalizedNodePath?.endsWith(normalizedRefPath) === true;
        });
        if (suffixMatches.length === 1) {
            return suffixMatches[0];
        }
    }

    if (basenameMatches.length > 1) {
        throw buildMentionedFileError(normalizedRef, 'ambiguous');
    }

    return null;
}

function resolveAgentContextScopeKey(agent: ResolvedAgentConfig | null | undefined): string | null {
    const scopePath = agent?.scopePath?.trim();
    if (!scopePath) {
        return null;
    }

    return scopePath === '/' ? '/' : (scopePath.endsWith('/') ? scopePath : `${scopePath}/`);
}

function isPathWithinAgentScope(path: string, scopePath: string | null): boolean {
    const normalizedPath = normalizeContextPath(path);
    const normalizedScopePath = normalizeContextPath(scopePath);
    if (!normalizedPath) {
        return false;
    }

    if (!normalizedScopePath || normalizedScopePath === '/') {
        return true;
    }

    return normalizedPath === normalizedScopePath || normalizedPath.startsWith(`${normalizedScopePath}/`);
}

function filterContextNodesByScope(nodes: ContextNode[], scopePath: string | null): ContextNode[] {
    if (!scopePath || scopePath === '/') {
        return nodes;
    }

    return nodes.filter((node) => isPathWithinAgentScope(node.path, scopePath));
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
        if (trimmed === '/') {
            return '/';
        }

        return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
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
    modelOptions: Record<string, boolean>,
    reasoningEffort: ReasoningEffort,
    explicit = false,
    groupMembers: GroupMember[] = []
): ConversationModelSelection | undefined {
    if (!providerId || !modelId) {
        return undefined;
    }

    return {
        providerId,
        modelId,
        modelOptions: cloneModelOptions(modelOptions),
        reasoningEffort,
        // 仅在用户显式覆盖时携带该字段，保持与历史持久化数据/默认选择的结构一致。
        ...(explicit ? { explicit: true } : {}),
        // group provider 才持久化成员勾选结果。
        ...(providerId === GROUP_PROVIDER_ID && groupMembers.length > 0
            ? { groupMembers: groupMembers.map((member) => ({ ...member })) }
            : {})
    };
}

function buildPersistedModelSelectionFromSendTarget(input: {
    providerId: string;
    modelId: string;
    modelOptions: Record<string, boolean>;
    reasoningEffort: ReasoningEffort;
    explicit: boolean;
    currentProviderId: string | null;
    groupMembers?: GroupMember[];
}): ConversationModelSelection | undefined {
    return buildConversationModelSelection(
        input.providerId,
        input.modelId,
        input.modelOptions,
        input.reasoningEffort,
        input.explicit && input.providerId === input.currentProviderId,
        input.providerId === GROUP_PROVIDER_ID ? (input.groupMembers ?? []) : []
    );
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

function resolveFirstVisibleQuestionMessage(messages: ConversationMessage[]): ConversationMessage | null {
    for (const message of messages) {
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

// DOM provider 受控页模型选择器尚未就绪（页面刚导航/未水合/未登录）。
// 与 DomAutomationProvider.MODELS_NOT_READY_ERROR_NAME 一致，按 name 跨边界识别。
function isModelsNotReadyError(error: unknown): error is Error {
    return error instanceof Error && error.name === 'ModelsNotReadyError';
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

function buildArchiveConversationProgressPart(input: {
    kind: MessageFunctionalPart['kind'];
    content: string;
}): MessageFunctionalPart {
    return {
        id: 'archive-conversation-progress',
        kind: input.kind,
        title: translateWorkspaceMessage('shared.archiveConversationToolTitle'),
        content: input.content,
        collapsed: false
    };
}

function buildArchiveConversationProgressStartPart(): MessageFunctionalPart {
    return buildArchiveConversationProgressPart({
        kind: 'tool_call',
        content: translateWorkspaceMessage('shared.archiveConversationInProgress')
    });
}

function buildArchiveConversationProgressResultPart(result: ArchiveExecutionResult): MessageFunctionalPart {
    return buildArchiveConversationProgressPart({
        kind: 'tool_result',
        content: buildArchiveFeedbackMessage(result)
    });
}

function buildArchiveConversationProgressFailurePart(reason: string): MessageFunctionalPart {
    return buildArchiveConversationProgressPart({
        kind: 'tool_result',
        content: translateWorkspaceMessage('shared.archiveConversationFailed', { reason })
    });
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
    activeDocumentPath?: string | null,
    activeDocumentId?: string | null
): ConversationArchiveStatus {
    if (!conversation || conversation.origin !== 'local' || !conversation.archive) {
        return buildIdleConversationArchiveStatus();
    }

    const visibleMessageCount = buildVisibleMessages(conversation.messages).length;
    const normalizedActiveDocumentPath = activeDocumentPath?.trim() || '';
    const normalizedActiveDocumentId = activeDocumentId?.trim() || '';
    const matchesActiveDocument = normalizedActiveDocumentId
        ? conversation.archive.documentId === normalizedActiveDocumentId
        : (!normalizedActiveDocumentPath || conversation.archive.documentPath === normalizedActiveDocumentPath);
    const isCurrentSnapshot = matchesActiveDocument && visibleMessageCount === conversation.archive.sourceMessageCount;

    return {
        state: isCurrentSnapshot ? 'archived' : 'stale',
        archivedAt: conversation.archive.archivedAt,
        documentPath: conversation.archive.documentPath,
        documentId: conversation.archive.documentId,
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
        controlledPageCapability: null,
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
        currentReasoningEffort: DEFAULT_REASONING_EFFORT,
        currentModelSelectionExplicit: false,
        currentGroupMembers: [],
        questionIndexFilter: 'all',
        isQuestionIndexPanelOpen: true,
        activeQuestionId: null,
        pendingScrollQuestionId: null,
        editingQuestionId: null,
        draftPrompt: '',
        lastSubmittedPrompt: null,
        draftFocusRequestKey: 0,
        draftAttachments: [],
        attachmentError: null,
        activeAgentContext: null,
        workspaceAgentContext: null,
        conversationContextProvider: null,
        conversationAgentConfigs: {},
        conversationOnFileChanged: null,
        activeWorkspaceAgentKey: null,
        activeWorkspacePath: null,
        activeWorkspaceSelectedNodePath: null,
        activeWorkspaceDocument: null,
        activeWorkspaceContextProvider: null,
        onWorkspaceFileChanged: null,
        isArchivingConversation: false,
        archiveFeedback: null,
        archiveConversationProgressPart: null,
        currentConversationArchiveStatus: buildIdleConversationArchiveStatus(),
        runtimeMode: 'web'
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

        /** 群聊候选成员池：config 候选与当前运行模式可用 provider 的交集。 */
        groupCandidateMembers(state): GroupMember[] {
            const availableIds = new Set(state.availableProviders.map((provider) => provider.id));
            return resolveGroupCandidates().filter((member) => availableIds.has(member.providerId));
        },

        attachmentProviderId(state): string {
            if (state.currentModelSelectionExplicit && state.currentProviderId) {
                return state.currentProviderId;
            }
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
        reportUnhandledBackendError(error: unknown) {
            const message = error instanceof Error
                ? error.message
                : typeof error === 'string'
                    ? error
                    : String(error);
            const normalized = message.trim();
            if (!normalized) {
                return;
            }

            this.currentError = normalized;
        },

        clearCurrentError() {
            this.currentError = null;
        },

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
            // currentModelId 可能在 provider 目录刷新时被重置为空（setProviderCatalog），
            // 此时不能让已选 provider（尤其 group）丢失，回退到该 provider 的默认模型。
            let modelId = this.currentModelId;
            if (this.currentProviderId && !modelId) {
                modelId = this.resolveProviderConfig(this.currentProviderId)?.defaultModel || '';
            }
            return buildConversationModelSelection(
                this.currentProviderId,
                modelId,
                this.currentModelOptions,
                this.currentReasoningEffort,
                this.currentModelSelectionExplicit,
                this.currentGroupMembers
            );
        },

        syncCurrentConversationModelSelection() {
            if (!this.currentConversation || this.isPreviewing || this.currentConversation.compare) {
                return;
            }

            const next = this.buildCurrentConversationModelSelection();
            // 不允许用 undefined 覆盖一条已存在的有效选择：目录刷新瞬间 currentModelId/currentProviderId
            // 可能短暂为空，若直接写回会把 group 等已选 provider 从持久化里抹掉，导致后续轮次回退到 agent 默认 provider。
            if (!next && this.currentConversation.modelSelection?.providerId) {
                console.warn('[ChatStore]', JSON.stringify({
                    stage: 'syncModelSelection-skip-undefined-overwrite',
                    conversationId: this.currentConversation.id,
                    currentProviderId: this.currentProviderId,
                    currentModelId: this.currentModelId,
                    existingProviderId: this.currentConversation.modelSelection.providerId
                }));
                return;
            }
            this.currentConversation.modelSelection = next;
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
                // 恢复该会话持久化的「显式覆盖」标记，供 setCurrentModelProvider 触发的 sync 写回。
                this.currentModelSelectionExplicit = modelSelection.explicit === true;
                await this.setCurrentModelProvider(modelSelection.providerId, modelSelection.modelId);
                this.currentModelOptions = normalizeModelOptions(
                    this.currentModelConfig || undefined,
                    modelSelection.modelOptions
                );
                this.currentReasoningEffort = modelSelection.reasoningEffort || DEFAULT_REASONING_EFFORT;
                this.syncCurrentConversationModelSelection();
                return;
            }

            this.currentModelSelectionExplicit = false;
            if (!this.currentProviderId && this.availableProviders[0]?.id) {
                await this.setCurrentModelProvider(this.availableProviders[0].id);
                return;
            }

            if (this.currentProviderId && !this.currentModelId) {
                await this.setCurrentModelProvider(this.currentProviderId);
                return;
            }

            this.currentModelOptions = normalizeModelOptions(this.currentModelConfig || undefined, this.currentModelOptions);
            this.currentReasoningEffort = conversation?.modelSelection?.reasoningEffort || DEFAULT_REASONING_EFFORT;
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

        setControlledPageCapability(capability: ControlledPageCapability | null) {
            this.controlledPageCapability = capability ? markRaw(capability) : null;
        },

        /**
         * 显示某个 dom provider 的受控页窗口（真实 chatgpt.com / gemini 页面）。
         * - 已有真实会话的窗口：仅 show，不重载，保留当前 thread；
         * - 全新/空白窗口：导航到站点（便于登录、验证登录态、查看）。
         * 故意不传 targetUrl（只用 targetUrlIfBlank），避免把已有 thread 重载丢失。
         */
        async revealControlledPage(providerId: string): Promise<void> {
            await this.controlledPageCapability?.openControlledPage({
                providerId,
                visible: true,
                targetUrlIfBlank: DOM_PROVIDER_SITE_URLS[providerId]
            });
        },

        setRuntimeMode(runtimeMode: RuntimeMode) {
            this.runtimeMode = runtimeMode;
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
                this.currentReasoningEffort = DEFAULT_REASONING_EFFORT;
                return;
            }

            if (!nextCatalog.some((item) => item.id === this.currentProviderId)) {
                this.currentProviderId = nextCatalog[0].id;
            }

            // 目录刷新会清空 currentModelId；这是「空 modelId 抹掉会话已选 provider」链路的起点，留观测点。
            console.log('[ChatStore]', JSON.stringify({
                stage: 'setProviderCatalog-reset-modelId',
                currentProviderId: this.currentProviderId,
                previousModelId: this.currentModelId,
                conversationId: this.currentConversation?.id
            }));
            this.currentModelId = '';
            this.currentModelOptions = {};
            this.currentReasoningEffort = DEFAULT_REASONING_EFFORT;
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
            console.log('[ChatStore]', JSON.stringify({ stage: 'loadProviderModels-start', providerId }));

            try {
                const catalog = this.providerModelsResolver
                    ? await this.providerModelsResolver(providerId)
                    : {
                        models: baseProvider.models.map(cloneModelConfig),
                        defaultModel: baseProvider.defaultModel
                    };

                console.log('[ChatStore]', JSON.stringify({
                    stage: 'loadProviderModels-success',
                    providerId,
                    count: catalog.models.length,
                    modelIds: catalog.models.map((m) => m.id)
                }));
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
                // 模型选择器未就绪：先用静态兜底，但不标记 loaded，使下次重开/切换 provider 时重读真实模型。
                const ready = !isModelsNotReadyError(error);
                console.warn('[ChatStore]', JSON.stringify({
                    stage: 'loadProviderModels-error',
                    providerId,
                    isModelsNotReady: isModelsNotReadyError(error),
                    loaded: ready,
                    error: error instanceof Error ? error.message : String(error)
                }));
                this.setProviderModelState(providerId, { loading: false, loaded: ready });
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
                // 模型目录异步就绪（'dom' 兜底 → 真实模型如 opus-4-8）后，把默认模型/档位同步到受控页面。
                this.applyProviderPageDefaults(providerId);
            }

            return provider;
        },

        async init() {
            if (this.currentProviderId) {
                await this.ensureProviderModelsLoaded(this.currentProviderId);
            }

            await this.loadLocalConversations();
            if (!this.currentConversation) {
                const savedConversationId = readLastLocalConversationId();
                if (savedConversationId) {
                    await this.selectLocalConversation(savedConversationId);
                }
            }
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
            this.currentReasoningEffort = this.currentConversation?.modelSelection?.reasoningEffort || this.currentReasoningEffort || DEFAULT_REASONING_EFFORT;
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
            if (providerId === GROUP_PROVIDER_ID) {
                this.ensureGroupMembersInitialized();
                this.syncCurrentConversationModelSelection();
            }
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

        // 用户在下拉框主动切换 provider/model 的入口：标记为显式覆盖，使其优先于 agent 默认模型。
        async setCurrentModelProviderByUser(providerId: string, modelId?: string) {
            this.currentModelSelectionExplicit = true;
            await this.setCurrentModelProvider(providerId, modelId);
            // 用户主动切 provider：把默认模型/档位同步到受控页面（DOM provider），无需等发送。
            this.applyProviderPageDefaults(providerId);
        },

        setCurrentModelByUser(modelId: string) {
            this.currentModelSelectionExplicit = true;
            this.setCurrentModel(modelId);
            this.applyProviderPageDefaults();
        },

        setCurrentModelOption(key: string, enabled: boolean) {
            const model = this.currentModelConfig || undefined;
            if (!model?.options?.some((option) => option.key === key)) {
                return;
            }

            this.currentModelOptions = normalizeModelOptions(model, this.currentModelOptions, { key, enabled });
            this.syncCurrentConversationModelSelection();
        },

        setCurrentReasoningEffort(reasoningEffort: ReasoningEffort) {
            if (reasoningEffort !== 'low' && reasoningEffort !== 'medium' && reasoningEffort !== 'high') {
                return;
            }

            this.currentReasoningEffort = reasoningEffort;
            this.syncCurrentConversationModelSelection();
            this.applyProviderPageDefaults();
        },

        /** 默认勾选成员：dom-group 预设与候选池的交集（候选不可用时回退候选首项）。 */
        resolveDefaultGroupMembers(): GroupMember[] {
            const candidates = this.groupCandidateMembers;
            const preset = resolveGroupMembers(GROUP_DEFAULT_PRESET_ID)
                .filter((member) => candidates.some((candidate) => candidate.providerId === member.providerId))
                .map((member) => ({ ...member }));
            if (preset.length > 0) {
                return preset;
            }
            return candidates.length > 0 ? [{ ...candidates[0] }] : [];
        },

        /**
         * 切到 group 时初始化勾选成员：优先用会话持久化的 groupMembers（过滤为当前可用候选），
         * 否则回退默认预设；保证至少 1 个成员。
         */
        ensureGroupMembersInitialized() {
            const candidates = this.groupCandidateMembers;
            const persisted = this.currentConversation?.modelSelection?.groupMembers;
            const fromPersisted = Array.isArray(persisted)
                ? persisted.filter((member) => candidates.some((candidate) => candidate.providerId === member.providerId))
                : [];
            // 按候选顺序归一，保证展示稳定。
            const selectedIds = new Set(
                (fromPersisted.length > 0 ? fromPersisted : this.resolveDefaultGroupMembers())
                    .map((member) => member.providerId)
            );
            let next = candidates.filter((candidate) => selectedIds.has(candidate.providerId));
            if (next.length === 0 && candidates.length > 0) {
                next = [{ ...candidates[0] }];
            }
            this.currentGroupMembers = next.map((member) => ({ ...member }));
            console.log('[ChatStore]', JSON.stringify({
                stage: 'ensureGroupMembersInitialized',
                persisted: Array.isArray(persisted) ? persisted.map((m) => m.providerId) : null,
                candidates: candidates.map((m) => m.providerId),
                fromPersisted: fromPersisted.map((m) => m.providerId),
                result: this.currentGroupMembers.map((m) => m.providerId)
            }));
        },

        /** 顶部勾选区切换某候选成员的参与状态（保证至少保留 1 个）。 */
        toggleGroupMember(providerId: string) {
            const candidates = this.groupCandidateMembers;
            if (!candidates.some((candidate) => candidate.providerId === providerId)) {
                return;
            }
            const isSelected = this.currentGroupMembers.some((member) => member.providerId === providerId);
            const selectedIds = new Set(this.currentGroupMembers.map((member) => member.providerId));
            if (isSelected) {
                if (this.currentGroupMembers.length <= 1) {
                    return;
                }
                selectedIds.delete(providerId);
            } else {
                selectedIds.add(providerId);
            }
            // 按候选顺序重排，保证展示稳定。
            this.currentGroupMembers = candidates
                .filter((candidate) => selectedIds.has(candidate.providerId))
                .map((member) => ({ ...member }));
            console.log('[ChatStore]', JSON.stringify({
                stage: 'toggleGroupMember',
                toggled: providerId,
                wasSelected: isSelected,
                result: this.currentGroupMembers.map((m) => m.providerId)
            }));
            this.syncCurrentConversationModelSelection();
            this.applyProviderPageDefaults(GROUP_PROVIDER_ID);
        },

        /**
         * 把当前默认模型与推理档位同步到受控页面（仅 DOM 类 provider 实现 applyPageDefaults）。
         * 在切换 provider、用户改模型/档位、模型目录就绪等时机调用，使网页状态即时反映 app 选择。
         * fire-and-forget：best-effort，不阻塞 UI，失败由 provider 内部记录。
         */
        applyProviderPageDefaults(providerId?: string): void {
            const targetProviderId = providerId || this.currentProviderId;
            if (!targetProviderId) {
                return;
            }
            const provider = this.resolveModelProvider(targetProviderId);
            void provider?.applyPageDefaults?.({
                modelId: this.currentModelId,
                reasoningEffort: this.currentReasoningEffort,
                ...(targetProviderId === GROUP_PROVIDER_ID
                    ? { groupMembers: this.currentGroupMembers.map((member) => ({ ...member })) }
                    : {})
            });
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

            // 当前对话已有持久化的模型选择，不覆盖（切换模式/agent 时不应改变已有对话属性）。
            if (this.currentConversation?.modelSelection?.providerId) {
                return;
            }

            // agent 驱动的选择不是用户显式覆盖。
            this.currentModelSelectionExplicit = false;
            await this.setCurrentModelProvider(providerId, targetAgent.modelName?.trim() || undefined);
        },

        saveWorkspaceAgentContext(agent: ResolvedAgentConfig | null) {
            this.workspaceAgentContext = agent ? cloneResolvedAgentConfig(agent) : null;
        },

        clearWorkspaceAgentContext() {
            this.workspaceAgentContext = null;
        },

        setConversationExecutionContext(input: {
            contextProvider: IContextProvider | null;
            onFileChanged?: ((change: {
                path: string;
                beforeContent: string;
                afterContent: string;
                alreadyPersisted?: boolean;
            }) => Promise<void> | void) | null;
        }) {
            const nextProvider = input.contextProvider ? markRaw(input.contextProvider) : null;
            const nextOnFileChanged = input.onFileChanged ? markRaw(input.onFileChanged) : null;
            if (
                this.conversationContextProvider?.id === nextProvider?.id
                && this.conversationOnFileChanged === nextOnFileChanged
            ) {
                return;
            }

            this.conversationContextProvider = nextProvider;
            this.conversationOnFileChanged = nextOnFileChanged;
            this.conversationAgentConfigs = {};
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

            // 已有当前对话时，切换全屏/模式属于纯视图变化，不应改动其模型：
            // 既包括持久化的模型选择，也包括内存中已解析出的模型（新会话尚未落库，
            // 但右栏已按文档/agent 默认解析出 provider）。否则展开全屏会把当前模型
            // 静默切换为工作区根 agent 的默认模型。
            if (this.currentConversation && (this.currentConversation.modelSelection?.providerId || this.currentProviderId)) {
                return;
            }

            // agent 驱动的选择不是用户显式覆盖。
            this.currentModelSelectionExplicit = false;
            await this.setCurrentModelProvider(providerId, agent.modelName?.trim() || undefined);
        },

        async loadConversationAgentConfigs(): Promise<Record<string, ResolvedAgentConfig>> {
            if (Object.keys(this.conversationAgentConfigs).length > 0) {
                return this.conversationAgentConfigs;
            }

            const provider = this.conversationContextProvider ?? this.activeWorkspaceContextProvider;
            if (!provider) {
                return {};
            }

            await provider.initializeAccess();
            const context = await provider.getContext();
            this.conversationAgentConfigs = Object.fromEntries(
                Object.entries(resolveAllScopedAgentConfigsFromWorkspaceContext(context)).map(([key, agent]) => [
                    key,
                    cloneResolvedAgentConfig(agent)
                ])
            );
            return this.conversationAgentConfigs;
        },

        async resolveAgentContextByKey(agentKey: string | null | undefined): Promise<ResolvedAgentConfig | null> {
            const normalizedAgentKey = normalizeAgentScopeKey(agentKey);
            if (!normalizedAgentKey) {
                return null;
            }

            const activeAgentScopeKey = resolveAgentContextScopeKey(this.activeAgentContext);
            if (activeAgentScopeKey === normalizedAgentKey && this.activeAgentContext) {
                return cloneResolvedAgentConfig(this.activeAgentContext);
            }

            const workspaceAgentScopeKey = resolveAgentContextScopeKey(this.workspaceAgentContext);
            if (workspaceAgentScopeKey === normalizedAgentKey && this.workspaceAgentContext) {
                return cloneResolvedAgentConfig(this.workspaceAgentContext);
            }

            const agentConfigs = await this.loadConversationAgentConfigs();
            const agent = agentConfigs[normalizedAgentKey];
            return agent ? cloneResolvedAgentConfig(agent) : null;
        },

        async resolveCurrentConversationAgentContext(): Promise<ResolvedAgentConfig | null> {
            const boundAgentContext = await this.resolveAgentContextByKey(this.currentConversation?.agentKey);
            if (boundAgentContext) {
                return boundAgentContext;
            }

            return this.activeAgentContext ? cloneResolvedAgentConfig(this.activeAgentContext) : null;
        },

        getActiveAgentContextSnapshot(): ResolvedAgentConfig | null {
            return this.activeAgentContext ? cloneResolvedAgentConfig(this.activeAgentContext) : null;
        },

        resolveCurrentConversationContextProvider(): IContextProvider | null {
            if (!normalizeAgentScopeKey(this.currentConversation?.agentKey)) {
                return null;
            }

            return this.conversationContextProvider;
        },

        resolveMentionContextProvider(): IContextProvider | null {
            return this.resolveCurrentConversationContextProvider() ?? this.activeWorkspaceContextProvider;
        },

        resolveMentionContextScopePath(agentContext?: ResolvedAgentConfig | null): string | null {
            return resolveAgentContextScopeKey(agentContext ?? this.resolveEffectiveAgentContext());
        },

        /**
         * group 会话中 `@成员名` 是「成员定向」而非工作区文件引用。
         * 返回当前 group 预设的成员名（小写）集合，供文件引用解析排除；
         * 非 group 会话返回空集，文件引用行为完全不变。
         */
        resolveActiveGroupMentionNames(): Set<string> {
            if (this.currentProviderId !== GROUP_PROVIDER_ID) {
                return new Set();
            }
            // 排除全部候选成员名（含未勾选项），避免 @成员名 被当作文件引用解析。
            return new Set(resolveGroupCandidates().map((member) => member.name.toLowerCase()));
        },

        async resolveMentionedContextDocuments(
            prompt: string,
            options?: { scopePath?: string | null; excludedRefs?: ReadonlySet<string> }
        ): Promise<ResolvedMentionedContextDocument[]> {
            const refs = extractMentionedFileRefs(prompt, options?.excludedRefs);
            if (refs.length === 0) {
                return [];
            }

            const provider = this.resolveMentionContextProvider();
            if (!provider) {
                throw new Error('Workspace file references require an active workspace context provider.');
            }

            await provider.initializeAccess();
            const context = await provider.getContext();
            const scopedNodes = filterContextNodesByScope(context.nodes, options?.scopePath ?? null);
            const fileNodes = flattenContextFileNodes(scopedNodes);
            const resolved = new Map<string, ResolvedMentionedContextDocument>();

            for (const ref of refs) {
                const candidate = resolveMentionCandidateByReference(ref, fileNodes);
                if (!candidate) {
                    throw buildMentionedFileError(ref, 'missing');
                }

                const normalizedPath = normalizeContextPath(candidate.path);
                if (!normalizedPath || resolved.has(normalizedPath)) {
                    continue;
                }

                const document = await provider.readDocument(normalizedPath);
                if (!isTextDocumentMimeType(document.mimeType)) {
                    throw buildMentionedFileError(ref, 'non-text');
                }

                resolved.set(normalizedPath, {
                    path: normalizedPath,
                    name: candidate.name,
                    document
                });
            }

            return Array.from(resolved.values());
        },

        buildMentionedFilesPromptSections(files: ResolvedMentionedContextDocument[]): string {
            return augmentPromptWithMentionedFiles(
                '',
                files.map((file) => ({
                    path: file.path,
                    name: file.name,
                    content: decodeTextDocument(file.document.dataBase64)
                }))
            ).trim();
        },

        applyConversationReferencedDocumentPaths(conversation: Conversation, paths: string[]): void {
            if (conversation.origin !== 'local' || paths.length === 0) {
                return;
            }

            const nextDocumentPaths = new Set(conversation.documentPaths ?? []);
            for (const path of paths) {
                const normalizedPath = normalizeContextPath(path);
                if (normalizedPath) {
                    nextDocumentPaths.add(normalizedPath);
                }
            }
            conversation.documentPaths = Array.from(nextDocumentPaths);
        },

        resolveCurrentConversationFileChangeHandler():
        ((change: {
            path: string;
            beforeContent: string;
            afterContent: string;
            alreadyPersisted?: boolean;
        }) => Promise<void> | void) | null {
            if (!normalizeAgentScopeKey(this.currentConversation?.agentKey)) {
                return null;
            }

            return this.conversationOnFileChanged;
        },

        async syncConversationExecutionContext(conversation: Conversation | null): Promise<void> {
            if (!conversation?.agentKey) {
                this.setActiveAgentContext(null);
                return;
            }

            if (!this.conversationContextProvider && this.activeWorkspaceContextProvider) {
                this.setConversationExecutionContext({
                    contextProvider: this.activeWorkspaceContextProvider,
                    onFileChanged: this.onWorkspaceFileChanged
                });
            }

            const resolvedAgentContext = await this.resolveAgentContextByKey(conversation.agentKey);
            this.setActiveAgentContext(resolvedAgentContext);
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

        async bindConversationToDocument(id: string, input: {
            documentPath: string | null;
            previousDocumentPath?: string | null;
        }): Promise<void> {
            if (!this.storageProvider) {
                throw new Error('Storage provider is not initialized');
            }

            const targetConversation = this.conversations.find((conversation) => conversation.id === id)
                ?? (this.currentConversation?.id === id ? this.currentConversation : null);
            if (!targetConversation) {
                throw new Error(`Conversation ${id} not found`);
            }

            const normalizedDocumentPath = normalizeContextPath(input.documentPath);
            if (!normalizedDocumentPath) {
                throw new Error('Document path must not be empty.');
            }

            const normalizedPreviousDocumentPath = normalizeContextPath(input.previousDocumentPath)
                ?? normalizeContextPath(targetConversation.documentPaths?.[0]);
            const existingPaths = Array.isArray(targetConversation.documentPaths)
                ? targetConversation.documentPaths
                : [];
            const retainedPaths = existingPaths.filter((path) => {
                const normalizedPath = normalizeContextPath(path);
                return normalizedPath !== normalizedPreviousDocumentPath && normalizedPath !== normalizedDocumentPath;
            });

            let resolvedDocumentId: string | undefined;
            if (this.activeWorkspaceContextProvider) {
                try {
                    resolvedDocumentId = await this.activeWorkspaceContextProvider.getDocumentId(normalizedDocumentPath);
                } catch {
                    // fall back to path-only linking if ID resolution fails
                }
            }

            const existingIds = Array.isArray(targetConversation.documentIds)
                ? targetConversation.documentIds
                : [];
            const nextDocumentIds = resolvedDocumentId
                ? Array.from(new Set([resolvedDocumentId, ...existingIds]))
                : existingIds;

            const nextConversation = normalizeStoredConversation({
                ...cloneConversation(targetConversation),
                updatedAt: Date.now(),
                documentPaths: [normalizedDocumentPath, ...retainedPaths],
                documentIds: nextDocumentIds.length > 0 ? nextDocumentIds : undefined
            });

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

        applyInitialConversationDocumentRelation(
            conversation: Conversation,
            input: {
                documentPath?: string | null;
                activeDocument?: ContextDocument | null;
            }
        ): void {
            if (conversation.origin !== 'local') {
                return;
            }

            const normalizedDocumentPath = this.resolveConversationDocumentPath(
                input.documentPath ?? null,
                input.activeDocument ?? null
            );
            if (!normalizedDocumentPath) {
                return;
            }

            const nextDocumentPaths = new Set(conversation.documentPaths ?? []);
            nextDocumentPaths.add(normalizedDocumentPath);
            conversation.documentPaths = Array.from(nextDocumentPaths);

            if (input.activeDocument?.documentId) {
                const nextDocumentIds = new Set(conversation.documentIds ?? []);
                nextDocumentIds.add(input.activeDocument.documentId);
                conversation.documentIds = Array.from(nextDocumentIds);
            }
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

        async resolveSendTarget(agentContext?: ResolvedAgentConfig | null) {
            const effectiveAgentContext = agentContext ?? this.activeAgentContext;
            // 用户在下拉框显式选择时（explicit），会话模型选择优先于 agent 默认模型；
            // 否则保持既有行为：agent 指定的模型优先于（仅为默认值的）currentProviderId。
            const explicitOverride = this.currentModelSelectionExplicit && !!this.currentProviderId;
            // 存量会话若曾被「显式选择」（persisted.explicit===true，如用户主动选了 group），
            // 即便内存里的 explicit 标志在视图/会话切换中被重置丢失，也以持久化的 providerId 为准，
            // 避免已确定的 group 等会话被静默降级到 agent 默认 provider（下拉框仍显示 group，输出却变单条）。
            // 注意：仅认 explicit 的持久化选择；新建/agent 驱动会话（无 explicit）仍走 agent 默认优先的既有逻辑。
            const persisted = this.currentConversation?.modelSelection;
            const persistedExplicitProviderId = persisted?.explicit ? persisted.providerId : undefined;
            const requestedProviderId = explicitOverride
                ? this.currentProviderId
                : (persistedExplicitProviderId || effectiveAgentContext?.modelProviderName?.trim() || this.currentProviderId);
            if (!requestedProviderId) {
                throw new Error('No active model provider selected.');
            }
            console.log('[ChatStore]', JSON.stringify({
                stage: 'resolveSendTarget',
                currentProviderId: this.currentProviderId,
                currentModelSelectionExplicit: this.currentModelSelectionExplicit,
                explicitOverride,
                persistedProviderId: persisted?.providerId,
                persistedExplicit: persisted?.explicit === true,
                agentProviderId: effectiveAgentContext?.modelProviderName?.trim() || null,
                requestedProviderId
            }));

            const providerConfig = await this.ensureProviderModelsLoaded(requestedProviderId);
            if (!providerConfig) {
                throw new Error(`Provider '${requestedProviderId}' is unavailable.`);
            }

            // 显式覆盖时忽略 agent.modelName，改用下拉框选中的 currentModelId。
            const requestedModelId = explicitOverride ? undefined : effectiveAgentContext?.modelName?.trim();
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

            if (requestedProviderId === GROUP_PROVIDER_ID) {
                console.log('[ChatStore]', JSON.stringify({
                    stage: 'resolveSendTarget-groupMembers',
                    currentGroupMembers: this.currentGroupMembers.map((m) => m.providerId),
                    persistedGroupMembers: Array.isArray(this.currentConversation?.modelSelection?.groupMembers)
                        ? this.currentConversation!.modelSelection!.groupMembers!.map((m) => m.providerId)
                        : null,
                    candidates: this.groupCandidateMembers.map((m) => m.providerId)
                }));
            }

            return {
                provider,
                providerId: requestedProviderId,
                modelId: resolvedModelId,
                modelOptions: normalizeModelOptions(
                    resolveModelConfig(providerConfig, resolvedModelId),
                    sourceOptions
                ),
                reasoningEffort: this.currentConversation?.modelSelection?.providerId === requestedProviderId
                    && this.currentConversation.modelSelection.modelId === resolvedModelId
                    ? this.currentConversation.modelSelection.reasoningEffort || DEFAULT_REASONING_EFFORT
                    : this.currentReasoningEffort || DEFAULT_REASONING_EFFORT,
                groupMembers: requestedProviderId === GROUP_PROVIDER_ID
                    ? (this.currentGroupMembers.length > 0
                        ? this.currentGroupMembers.map((member) => ({ ...member }))
                        : this.resolveDefaultGroupMembers())
                    : undefined
            };
        },

        clearArchiveFeedback() {
            this.archiveFeedback = null;
        },

        clearArchiveConversationProgressPart() {
            this.archiveConversationProgressPart = null;
        },

        refreshCurrentConversationArchiveStatus(): void {
            this.currentConversationArchiveStatus = resolveConversationArchiveStatus(
                this.currentConversation,
                this.activeWorkspaceDocument?.path,
                this.activeWorkspaceDocument?.documentId
            );
        },

        async markCurrentConversationArchived(input: {
            documentPath: string;
            documentId?: string;
            sourceMessageCount: number;
            archivedAt: number;
        }): Promise<void> {
            if (!this.currentConversation || this.currentConversation.origin !== 'local') {
                return;
            }

            this.currentConversation.archive = {
                documentPath: input.documentPath,
                documentId: input.documentId,
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
                this.archiveConversationProgressPart = buildArchiveConversationProgressFailurePart(
                    'Workspace file change pipeline is unavailable.'
                );
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
            this.archiveConversationProgressPart = buildArchiveConversationProgressStartPart();

            try {
                const sendTarget = await this.resolveSendTarget(await this.resolveCurrentConversationAgentContext());
                const result = await executeConversationArchive({
                    provider: sendTarget.provider,
                    modelId: sendTarget.modelId,
                    modelOptions: sendTarget.modelOptions,
                    reasoningEffort: sendTarget.reasoningEffort,
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
                    documentId: activeDocument.documentId,
                    sourceMessageCount: this.visibleMessages.length,
                    archivedAt: Date.now()
                });

                this.archiveConversationProgressPart = buildArchiveConversationProgressResultPart(result);
                this.archiveFeedback = {
                    tone: result.changed ? 'success' : 'info',
                    message: buildArchiveFeedbackMessage(result)
                };
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                this.archiveConversationProgressPart = buildArchiveConversationProgressFailurePart(reason);
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

        startQuestionEdit(questionId: string) {
            if (!this.currentConversation || this.isPreviewing) {
                return;
            }

            const indices = resolveQuestionPairIndices(this.currentConversation.messages, questionId);
            const userIndex = indices.find((index) => this.currentConversation!.messages[index]?.role === 'user');
            if (userIndex === undefined) {
                return;
            }

            const userMessage = this.currentConversation.messages[userIndex];
            this.editingQuestionId = questionId;
            this.draftPrompt = userMessage.content || userMessage.requestSnapshot?.prompt || '';
            this.draftFocusRequestKey += 1;
        },

        cancelQuestionEdit() {
            this.editingQuestionId = null;
        },

        truncateConversationFromQuestion(questionId: string) {
            if (!this.currentConversation) {
                return;
            }

            const messages = this.currentConversation.messages;
            const indices = resolveQuestionPairIndices(messages, questionId);
            const firstIndex = indices.length > 0 ? Math.min(...indices) : -1;
            if (firstIndex < 0) {
                return;
            }

            for (let index = firstIndex; index < messages.length; index += 1) {
                messages[index].deleted = true;
            }
            this.refreshCurrentConversationArchiveStatus();

            if (this.activeQuestionId) {
                const activeIndices = resolveQuestionPairIndices(messages, this.activeQuestionId);
                if (activeIndices.some((index) => index >= firstIndex)) {
                    this.activeQuestionId = null;
                }
            }
            if (this.pendingScrollQuestionId) {
                const pendingIndices = resolveQuestionPairIndices(messages, this.pendingScrollQuestionId);
                if (pendingIndices.some((index) => index >= firstIndex)) {
                    this.pendingScrollQuestionId = null;
                }
            }
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
                const shouldPreserveUnsavedDraft = !refreshed
                    && this.currentConversation.origin === 'local'
                    && this.currentConversation.messages.length === 0
                    && this.currentConversation.title === NEW_CHAT_TITLE;
                this.currentConversation = refreshed || (shouldPreserveUnsavedDraft ? this.currentConversation : null);
            }
            if (this.currentConversation?.origin === 'local') {
                writeLastLocalConversationId(this.currentConversation.id);
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
                if (this.currentConversation.origin === 'local') {
                    writeLastLocalConversationId(this.currentConversation.id);
                }
            }
            this.clearArchiveConversationProgressPart();
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
            this.editingQuestionId = null;
            this.refreshCurrentConversationArchiveStatus();
            await this.applyConversationModelSelection(this.currentConversation);
            await this.syncConversationExecutionContext(this.currentConversation);
        },

        async activateConversationSnapshot(conversation: Conversation) {
            if (conversation.compare || conversation.sync?.deleted) {
                return;
            }

            this.currentConversation = normalizeStoredConversation(conversation);
            this.clearArchiveConversationProgressPart();
            this.historySource = 'local';
            this.previewConversation = null;
            this.currentError = null;
            this.currentHistoryErrorCode = null;
            this.isExternalPreviewLoading = false;
            this.externalPreviewLoadingId = null;
            this.isQuestionIndexPanelOpen = true;
            this.activeQuestionId = null;
            this.pendingScrollQuestionId = null;
            this.editingQuestionId = null;
            this.refreshCurrentConversationArchiveStatus();
            await this.applyConversationModelSelection(this.currentConversation);
            await this.syncConversationExecutionContext(this.currentConversation);
        },

        async deleteLocalConversation(id: string) {
            if (!this.storageProvider) {
                this.currentError = 'Conversation storage is unavailable.';
                return;
            }

            const isDeletingCurrentConversation = !this.isPreviewing && this.currentConversation?.id === id;
            this.currentError = null;
            try {
                await this.storageProvider.deleteConversation(id);
                await this.loadLocalConversations();
            } catch (error) {
                this.currentError = formatHttpApiError(error);
                throw error;
            }

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

        async renameLocalConversation(id: string, title: string) {
            if (!this.storageProvider) {
                return;
            }

            const normalizedTitle = title.trim() || NEW_CHAT_TITLE;
            const storedConversation = await this.storageProvider.getConversation(id);
            const targetConversation = storedConversation
                ?? this.conversations.find((conversation) => conversation.id === id)
                ?? (this.currentConversation?.id === id ? this.currentConversation : null);
            if (!targetConversation) {
                return;
            }

            const renamedConversation: Conversation = {
                ...targetConversation,
                title: normalizedTitle
            };
            if (typeof this.storageProvider.saveConversationPreservingUpdatedAt === 'function') {
                await this.storageProvider.saveConversationPreservingUpdatedAt(renamedConversation);
            } else {
                await this.storageProvider.saveConversation(renamedConversation);
            }

            if (!this.isPreviewing && this.currentConversation?.id === id) {
                this.currentConversation = normalizeStoredConversation(renamedConversation);
            }

            await this.loadLocalConversations();
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

        async startNewConversation(input?: {
            boundNodeName?: string | null;
            agentKey?: string | null;
            documentPath?: string | null;
            activeDocument?: ContextDocument | null;
        }) {
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
            const nextConversation: Conversation = {
                id: createRuntimeUuid(),
                title: NEW_CHAT_TITLE,
                boundNodeName,
                origin: 'local',
                messages: [],
                updatedAt: Date.now(),
                modelSelection: this.buildCurrentConversationModelSelection()
            };
            if (!shouldClearConversationWorkspaceContext) {
                this.applyConversationAgentKey(nextConversation, input?.agentKey ?? this.activeWorkspaceAgentKey);
                this.applyInitialConversationDocumentRelation(nextConversation, {
                    documentPath: input?.documentPath ?? this.activeWorkspacePath,
                    activeDocument: input?.activeDocument ?? this.activeWorkspaceDocument
                });
                if (normalizeAgentScopeKey(nextConversation.agentKey) && this.activeWorkspaceContextProvider) {
                    this.setConversationExecutionContext({
                        contextProvider: this.activeWorkspaceContextProvider,
                        onFileChanged: this.onWorkspaceFileChanged
                    });
                }
            }
            this.clearArchiveConversationProgressPart();
            this.currentConversation = nextConversation;
            writeLastLocalConversationId(nextConversation.id);
            this.historySource = 'local';
            this.previewConversation = null;
            this.currentError = null;
            this.isQuestionIndexPanelOpen = true;
            this.activeQuestionId = null;
            this.pendingScrollQuestionId = null;
            this.editingQuestionId = null;
            this.refreshCurrentConversationArchiveStatus();

            if (hasWorkspaceAgentContext) {
                const defaultProviderId = this.availableProviders[0]?.id || '';
                if (defaultProviderId) {
                    await this.setCurrentModelProvider(defaultProviderId);
                } else {
                    this.currentProviderId = '';
                    this.currentModelId = '';
                    this.currentModelOptions = {};
                    this.currentReasoningEffort = DEFAULT_REASONING_EFFORT;
                }
            }

            this.syncCurrentConversationModelSelection();
        },

        setSidebarCollapsed(collapsed: boolean) {
            this.sidebarCollapsed = collapsed;
        },

        resetWorkspaceConversationState() {
            this.clearArchiveConversationProgressPart();
            this.previewConversation = null;
            this.historySource = 'local';
            this.currentError = null;
            this.currentHistoryErrorCode = null;
            this.isExternalPreviewLoading = false;
            this.externalPreviewLoadingId = null;
            this.isQuestionIndexPanelOpen = true;
            this.activeQuestionId = null;
            this.pendingScrollQuestionId = null;
            this.editingQuestionId = null;
            this.draftPrompt = '';
            this.lastSubmittedPrompt = null;
            this.draftAttachments = [];
            this.attachmentError = null;
        },

        clearWorkspaceConversationSelection() {
            this.currentConversation = null;
            writeLastLocalConversationId(null);
            this.previewConversation = null;
            this.historySource = 'local';
            this.currentError = null;
            this.currentHistoryErrorCode = null;
            this.isExternalPreviewLoading = false;
            this.externalPreviewLoadingId = null;
            this.isQuestionIndexPanelOpen = true;
            this.activeQuestionId = null;
            this.pendingScrollQuestionId = null;
            this.editingQuestionId = null;
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
                if (activatedConversation?.origin === 'local') {
                    writeLastLocalConversationId(activatedConversation.id);
                }
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
            if (importedConversation.origin === 'local') {
                writeLastLocalConversationId(importedConversation.id);
            }
            this.historySource = 'local';
            this.previewConversation = null;
            this.currentError = null;
            this.isQuestionIndexPanelOpen = true;
            this.refreshCurrentConversationArchiveStatus();
            await this.applyConversationModelSelection(this.currentConversation);
        },

        async persistCurrentConversation(input: { syncModelSelection?: boolean; conversation?: Conversation | null } = {}) {
            const conversation = input.conversation ?? this.currentConversation;
            if (!this.storageProvider || !conversation) {
                return;
            }

            conversation.updatedAt = Date.now();
            if (input.syncModelSelection !== false) {
                const previousConversation = this.currentConversation;
                if (previousConversation !== conversation) {
                    this.currentConversation = conversation;
                }
                this.syncCurrentConversationModelSelection();
                if (previousConversation !== conversation) {
                    this.currentConversation = previousConversation;
                }
            }
            await this.storageProvider.saveConversation(toRaw(conversation));
            if (conversation.origin === 'local') {
                writeLastLocalConversationId(conversation.id);
            }
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
                id: createRuntimeUuid(),
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
            const activeConversation = this.currentConversation;
            if (!activeConversation) {
                throw new Error('No active conversation available.');
            }
            const activeConversationId = activeConversation.id;

            if (!this.currentModelId) {
                throw new Error('Provider model catalog is not ready');
            }

            this.currentError = null;

            const editingQuestionId = this.editingQuestionId;
            const firstVisibleQuestion = resolveFirstVisibleQuestionMessage(activeConversation.messages || []);
            const wasEditingFirstVisibleQuestion = !!editingQuestionId
                && !!firstVisibleQuestion
                && getQuestionKey(firstVisibleQuestion) === editingQuestionId;
            if (editingQuestionId) {
                this.truncateConversationFromQuestion(editingQuestionId);
            }

            const history = buildProviderHistory(activeConversation.messages);
            const isFirstTurn = history.length === 0;
            const boundConversationAgentKey = normalizeAgentScopeKey(activeConversation.agentKey);
            const agentContext = boundConversationAgentKey
                ? await this.resolveAgentContextByKey(boundConversationAgentKey)
                : this.getActiveAgentContextSnapshot();
            const mentionScopePath = this.resolveMentionContextScopePath(agentContext);
            let mentionedContextDocuments: ResolvedMentionedContextDocument[] = [];
            const groupMentionNames = this.resolveActiveGroupMentionNames();
            const mentionedRefs = extractMentionedFileRefs(trimmedPrompt, groupMentionNames);
            if (mentionedRefs.length > 0) {
                try {
                    mentionedContextDocuments = await this.resolveMentionedContextDocuments(trimmedPrompt, {
                        scopePath: mentionScopePath,
                        excludedRefs: groupMentionNames
                    });
                } catch (error) {
                    this.currentError = error instanceof Error ? error.message : 'Failed to resolve referenced workspace files.';
                    return;
                }
            }
            const mentionedDocumentPaths = mentionedContextDocuments.map((file) => file.path);
            const shouldAutoAttachActiveDocument = this.workspaceMode === 'agent' && history.length === 0;
            const activeDocumentForRequest = shouldAutoAttachActiveDocument
                ? this.activeWorkspaceDocument
                : null;
            const requestDocumentPath = this.resolveConversationDocumentPath(this.activeWorkspacePath, activeDocumentForRequest);
            const requestProviderId = (this.currentModelSelectionExplicit && this.currentProviderId)
                ? this.currentProviderId
                : (agentContext?.modelProviderName?.trim() || this.currentProviderId);
            const requestProvider = requestProviderId
                ? this.resolveModelProvider(requestProviderId)
                : null;
            const mentionedSections = this.buildMentionedFilesPromptSections(mentionedContextDocuments);
            const promptWithMentionedFiles = mentionedSections
                ? `${trimmedPrompt}\n\n${mentionedSections}`
                : trimmedPrompt;
            const initialPreparedRequest = agentContext && requestProvider
                ? await prepareRequestWithActiveDocument(
                    requestProvider,
                    promptWithMentionedFiles,
                    {
                        activeDocument: activeDocumentForRequest,
                        attachments: pendingAttachments
                    }
                )
                : {
                    prompt: promptWithMentionedFiles,
                    attachments: pendingAttachments,
                    mode: 'none' as const
                };

            const questionId = createRuntimeUuid();
            const createdAt = Date.now();
            const userMsgId = createRuntimeUuid();
            const assistantMsgId = createRuntimeUuid();

            activeConversation.messages.push({
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

            activeConversation.messages.push({
                id: assistantMsgId,
                role: 'assistant',
                content: '',
                createdAt: createdAt + 1,
                questionId
            });
            const initialUserMessage = activeConversation.messages.find((message) => message.id === userMsgId);
            this.applyConversationDocumentRelation(activeConversation, {
                documentPath: requestDocumentPath ?? null,
                activeDocument: activeDocumentForRequest,
                requestSnapshot: initialUserMessage?.role === 'user' ? initialUserMessage.requestSnapshot : undefined,
                isFirstTurn
            });
            this.applyConversationReferencedDocumentPaths(activeConversation, mentionedDocumentPaths);
            this.refreshCurrentConversationArchiveStatus();

            this.isGenerating = true;
            this.isAbortRequested = false;
            this.currentError = null;
            this.attachmentError = null;
            this.lastSubmittedPrompt = prompt;
            this.draftPrompt = '';
            this.draftAttachments = [];
            this.editingQuestionId = null;
            await this.persistCurrentConversation({ syncModelSelection: false, conversation: activeConversation });
            const executionConversation = this.currentConversation?.id === activeConversationId
                ? this.currentConversation
                : activeConversation;

            try {
                const sendTarget = await this.resolveSendTarget(agentContext);
                if (!this.storageProvider) {
                    throw new Error('Providers not initialized');
                }
                if (this.isAbortRequested) {
                    const abortError = new Error('Aborted');
                    abortError.name = 'AbortError';
                    throw abortError;
                }

                executionConversation.origin = executionConversation.origin || 'local';
                const backendId = executionConversation.backendId;
                executionConversation.modelSelection = buildPersistedModelSelectionFromSendTarget({
                    providerId: sendTarget.providerId,
                    modelId: sendTarget.modelId,
                    modelOptions: sendTarget.modelOptions,
                    reasoningEffort: sendTarget.reasoningEffort,
                    // 显式覆盖时 sendTarget 即下拉框选择，保留该标记以便重开会话仍优先于 agent。
                    explicit: this.currentModelSelectionExplicit,
                    currentProviderId: this.currentProviderId,
                    groupMembers: sendTarget.groupMembers
                });
                const onUpdate = (
                    update: {
                        text: string;
                        annotations?: ConversationMessage['annotations'];
                        functionalParts?: ConversationMessage['functionalParts'];
                        groupMembers?: ConversationMessage['groupMembers'];
                        groupSummary?: ConversationMessage['groupSummary'];
                    }
                ) => {
                    const lastMsg = executionConversation.messages[executionConversation.messages.length - 1];
                    if (lastMsg.role === 'assistant') {
                        lastMsg.content = update.text;
                        lastMsg.annotations = update.annotations;
                        lastMsg.functionalParts = update.functionalParts;
                        if (update.groupMembers !== undefined) {
                            lastMsg.groupMembers = update.groupMembers;
                        }
                        if (update.groupSummary !== undefined) {
                            lastMsg.groupSummary = update.groupSummary;
                        }
                    }
                };
                const conversationContextProvider = this.resolveCurrentConversationContextProvider();
                const conversationOnFileChanged = this.resolveCurrentConversationFileChangeHandler();
                const result = this.agentRuntime
                    ? await this.agentRuntime.run(
                        {
                            prompt: initialPreparedRequest.prompt,
                            agent: agentContext,
                            workspace: {
                                activePath: this.activeWorkspacePath,
                                activeDocument: activeDocumentForRequest,
                                contextProvider: conversationContextProvider,
                                onFileChanged: conversationOnFileChanged ?? undefined
                            },
                            providerId: sendTarget.providerId,
                            modelId: sendTarget.modelId,
                            attachments: initialPreparedRequest.attachments,
                            history,
                            modelOptions: cloneModelOptions(sendTarget.modelOptions),
                            reasoningEffort: sendTarget.reasoningEffort,
                            groupMembers: sendTarget.groupMembers,
                            context: { conversationId: backendId }
                        },
                        onUpdate
                    )
                    : await (async () => {
                        const preparedRequest = initialPreparedRequest;

                        const providerResult = await sendTarget.provider.sendMessage(
                            preparedRequest.prompt,
                            {
                                context: { conversationId: backendId },
                                modelId: sendTarget.modelId,
                                attachments: preparedRequest.attachments,
                                history,
                                modelOptions: cloneModelOptions(sendTarget.modelOptions),
                                reasoningEffort: sendTarget.reasoningEffort,
                                groupMembers: sendTarget.groupMembers
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

                const normalizedRequestSnapshot = {
                    prompt: result.requestSnapshot?.prompt ?? initialPreparedRequest.prompt,
                    attachments: initialPreparedRequest.attachments.map((attachment) => ({ ...attachment })),
                    activeDocumentMode: result.requestSnapshot?.activeDocumentMode ?? initialPreparedRequest.mode
                };

                const latestConversation = this.currentConversation?.id === activeConversationId
                    ? this.currentConversation
                        : this.conversations.find((conversation) => conversation.id === activeConversationId)
                            ?? executionConversation;
                const targetConversation = latestConversation ?? activeConversation;
                targetConversation.backendId = result.conversationId;
                const userMsg = targetConversation.messages.find((message) => message.id === userMsgId);
                if (userMsg?.role === 'user') {
                    userMsg.content = normalizedRequestSnapshot.prompt;
                    userMsg.attachments = normalizedRequestSnapshot.attachments.length > 0
                        ? normalizedRequestSnapshot.attachments.map((attachment) => ({ ...attachment }))
                        : pendingAttachments.length > 0
                            ? pendingAttachments.map((attachment) => ({ ...attachment }))
                            : undefined;
                    userMsg.requestSnapshot = normalizedRequestSnapshot;
                }
                const lastMsg = targetConversation.messages[targetConversation.messages.length - 1];
                if (lastMsg.role === 'assistant') {
                    lastMsg.content = result.text;
                    lastMsg.annotations = result.annotations;
                    lastMsg.functionalParts = result.functionalParts;
                    if (result.groupMembers !== undefined) {
                        lastMsg.groupMembers = result.groupMembers;
                    }
                    if (result.groupSummary !== undefined) {
                        lastMsg.groupSummary = result.groupSummary;
                    }
                }

                if (this.shouldRegenerateConversationTitle(targetConversation, wasEditingFirstVisibleQuestion)) {
                    const seedTitle = trimmedPrompt || pendingAttachments[0]?.name || NEW_CHAT_TITLE;
                    targetConversation.title = await this.resolveConversationTitleFromPrompt(
                        sendTarget.provider,
                        seedTitle
                    );
                }

                if (this.currentConversation?.id === activeConversationId) {
                    this.currentConversation = targetConversation;
                }
                this.applyConversationAgentKey(targetConversation, this.activeWorkspaceAgentKey);
                await this.persistCurrentConversation({ syncModelSelection: false, conversation: targetConversation });
            } catch (err: unknown) {
                if (this.isAbortRequested || isAbortError(err)) {
                    this.currentError = null;
                    const targetConversation = this.currentConversation?.id === activeConversationId
                        ? this.currentConversation
                        : this.conversations.find((conversation) => conversation.id === activeConversationId)
                            ?? executionConversation;
                    if (this.currentConversation?.id === activeConversationId) {
                        this.currentConversation = targetConversation;
                    }
                    this.applyConversationAgentKey(targetConversation, this.activeWorkspaceAgentKey);
                    await this.persistCurrentConversation({ conversation: targetConversation });
                } else {
                    this.currentError = err instanceof Error ? err.message : 'Error sending message';
                    const targetConversation = this.currentConversation?.id === activeConversationId
                        ? this.currentConversation
                        : this.conversations.find((conversation) => conversation.id === activeConversationId)
                            ?? executionConversation;
                    if (this.currentConversation?.id === activeConversationId) {
                        this.currentConversation = targetConversation;
                    }
                    await this.persistCurrentConversation({ syncModelSelection: false, conversation: targetConversation });
                }
            } finally {
                this.isGenerating = false;
                this.isAbortRequested = false;
                this.lastSubmittedPrompt = null;
            }
        },

        shouldRegenerateConversationTitle(conversation: Conversation, wasEditingFirstVisibleQuestion: boolean): boolean {
            return conversation.title === NEW_CHAT_TITLE || wasEditingFirstVisibleQuestion;
        },

        async resolveConversationTitleFromPrompt(provider: IModelProvider | null, prompt: string): Promise<string> {
            const maxLength = 10;
            const fallbackTitle = buildFallbackConversationTitle(prompt, maxLength);
            const lightweightSelection = resolveLightweightModelSelection(this.runtimeMode);
            const lightweightProvider = this.modelProviderResolver
                ? this.modelProviderResolver(lightweightSelection.providerId)
                : provider;
            if (typeof lightweightProvider?.generateConversationTitle !== 'function') {
                return fallbackTitle;
            }

            try {
                const generated = await lightweightProvider.generateConversationTitle(prompt, maxLength);
                return sanitizeConversationTitle(generated, maxLength);
            } catch {
                return fallbackTitle;
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
            if (this.editingQuestionId === questionId) {
                this.editingQuestionId = null;
            }

            await this.persistCurrentConversation();
        },

        abortGeneration() {
            if (this.agentRuntime) {
                this.agentRuntime.abort();
            } else {
                const provider = this.resolveModelProvider(
                    (this.currentModelSelectionExplicit && this.currentProviderId)
                        ? this.currentProviderId
                        : (this.activeAgentContext?.modelProviderName?.trim() || this.currentProviderId)
                );
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
