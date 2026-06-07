import { reactive } from 'vue';
import type { ProviderConfig } from '@packages/core/config';
import type { Conversation, IConversationPersistProvider, IModelProvider, ResolvedAgentConfig } from '@plugins/ai-agent/api';

export type MockAgentViewStatus = {
    selectedNodePath: string | null;
    activePath: string | null;
    activeConversationId: string | null;
};

type WorkspaceMode = 'agent' | 'conversation';
type HistorySource = 'local' | 'external';

function cloneConversation<T extends Conversation | null>(conversation: T): T {
    if (!conversation) {
        return conversation;
    }

    return {
        ...conversation,
        documentPaths: conversation.documentPaths ? [...conversation.documentPaths] : undefined,
        documentIds: conversation.documentIds ? [...conversation.documentIds] : undefined,
        messages: conversation.messages.map((message) => ({
            ...message,
            attachments: message.attachments?.map((attachment) => ({ ...attachment })),
            annotations: message.annotations?.map((annotation) => ({ ...annotation })),
            functionalParts: message.functionalParts?.map((part) => ({ ...part })),
            requestSnapshot: message.requestSnapshot
                ? {
                    ...message.requestSnapshot,
                    attachments: message.requestSnapshot.attachments?.map((attachment) => ({ ...attachment }))
                }
                : undefined
        }))
    } as T;
}

export const mockChatStore = reactive({
    currentError: null as string | null,
    currentConversation: null as Conversation | null,
    conversations: [] as Conversation[],
    providerCatalog: [] as ProviderConfig[],
    availableProviders: [] as ProviderConfig[],
    providerModelStates: {} as Record<string, { loading: boolean; loaded: boolean }>,
    workspaceMode: 'agent' as WorkspaceMode,
    historySource: 'local' as HistorySource,
    sidebarCollapsed: true,
    workspaceAgentContext: null as ResolvedAgentConfig | null,
    savedAgentViewStatus: null as MockAgentViewStatus | null,
    workspaceContext: null as unknown,
    selectedConversationIds: [] as string[],
    storageProvider: null as IConversationPersistProvider | null,
    modelProvider: null as IModelProvider | null,

    clearCurrentError() {
        mockChatStore.currentError = null;
    },

    setWorkspaceMode(mode: WorkspaceMode) {
        mockChatStore.workspaceMode = mode;
    },

    saveAgentViewStatus(status: MockAgentViewStatus) {
        mockChatStore.savedAgentViewStatus = { ...status };
    },

    restoreAgentViewStatus(): MockAgentViewStatus | null {
        return mockChatStore.savedAgentViewStatus ? { ...mockChatStore.savedAgentViewStatus } : null;
    },

    saveWorkspaceAgentContext(agent: ResolvedAgentConfig | null) {
        mockChatStore.workspaceAgentContext = agent
            ? {
                ...agent,
                sourcePaths: [...(agent.sourcePaths ?? [])]
            }
            : null;
    },

    async applyWorkspaceAgentContextSelection(): Promise<void> {},

    setSidebarCollapsed(collapsed: boolean) {
        mockChatStore.sidebarCollapsed = collapsed;
    },

    setWorkspaceContext(input: unknown) {
        mockChatStore.workspaceContext = input;
    },

    clearWorkspaceConversationSelection() {
        mockChatStore.currentConversation = null;
        mockChatStore.historySource = 'local';
    },

    async selectLocalConversation(conversationId: string): Promise<void> {
        let conversation = mockChatStore.conversations.find((item) => item.id === conversationId) ?? null;
        if (!conversation && mockChatStore.storageProvider) {
            conversation = await mockChatStore.storageProvider.getConversation(conversationId);
        }

        if (!conversation) {
            throw new Error(`Conversation not found: ${conversationId}`);
        }

        mockChatStore.currentConversation = cloneConversation(conversation);
        mockChatStore.historySource = 'local';
        mockChatStore.workspaceMode = 'conversation';
    },

    setProviders(provider: IModelProvider, storage: IConversationPersistProvider) {
        mockChatStore.modelProvider = provider;
        mockChatStore.storageProvider = storage;
    },

    async loadLocalConversations(): Promise<void> {
        mockChatStore.conversations = mockChatStore.storageProvider
            ? (await mockChatStore.storageProvider.getAllConversations()).map((conversation) => cloneConversation(conversation))
            : [];
    },

    async ensureProviderModelsLoaded() {}
});

export function useMockChatStore() {
    return mockChatStore;
}

export function resetMockChatStore(): void {
    mockChatStore.currentError = null;
    mockChatStore.currentConversation = null;
    mockChatStore.conversations = [];
    mockChatStore.providerCatalog = [];
    mockChatStore.availableProviders = [];
    mockChatStore.providerModelStates = {};
    mockChatStore.workspaceMode = 'agent';
    mockChatStore.historySource = 'local';
    mockChatStore.sidebarCollapsed = true;
    mockChatStore.workspaceAgentContext = null;
    mockChatStore.savedAgentViewStatus = null;
    mockChatStore.workspaceContext = null;
    mockChatStore.selectedConversationIds = [];
    mockChatStore.storageProvider = null;
    mockChatStore.modelProvider = null;
}
