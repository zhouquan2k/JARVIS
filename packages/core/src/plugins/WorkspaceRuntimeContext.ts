import type { ContextDocument, FolderMetadata, IContextProvider } from '../interfaces/IContextProvider';

export interface WorkspaceRouteNavigationInput {
    currentRoutePath: string;
    nextRoutePath: string;
    selectedNodePath: string | null;
    activePath: string | null;
    activeScopeMetadata: FolderMetadata | null;
    revealSidebar?: boolean;
}

export interface WorkspaceContextSyncInput {
    activeScopeKey?: string | null;
    selectedNodePath?: string | null;
    activePath: string | null;
    activeDocument?: ContextDocument | null;
    contextProvider: IContextProvider | null;
    onFileChanged?: ((change: {
        path: string;
        beforeContent: string;
        afterContent: string;
        alreadyPersisted?: boolean;
    }) => Promise<void> | void) | null;
}

export type WorkspaceSelectionChangedEvent = WorkspaceContextSyncInput & {
    selectedNodePath?: string | null;
    activeScopeMetadata?: FolderMetadata | null;
};

export interface WorkspacePluginMessage {
    id: string;
    level: 'info' | 'warning' | 'error';
    message: string;
    actionLabel?: string;
    actionDisabled?: boolean;
}

export interface WorkspaceHostEvent {
    type: 'unhandled-error';
    message: string;
}

export interface WorkspaceErrorSource {
    getCurrentError(): string | null;
    clearCurrentError(): void;
}

export interface ConversationDocumentIdsSource {
    getDocumentIds(): readonly string[] | null | undefined;
}

export interface WorkspaceRuntimeContext {
    currentError: string | null;
    /** Current conversation's associated document IDs; null/undefined when no conversation active. */
    currentConversationDocumentIds?: readonly string[] | null;
    clearCurrentError(): void;
    beforeRouteNavigate(input: WorkspaceRouteNavigationInput): Promise<void> | void;
    publishWorkspaceSelectionChanged(input: WorkspaceSelectionChangedEvent): Promise<void> | void;
    registerCurrentErrorSource(source: WorkspaceErrorSource): () => void;
    registerBeforeRouteNavigateHandler(
        handler: (input: WorkspaceRouteNavigationInput) => Promise<void> | void
    ): () => void;
    registerWorkspaceSelectionChangedHandler(
        handler: (input: WorkspaceSelectionChangedEvent) => Promise<void> | void
    ): () => void;
    registerConversationDocumentIdsSource(source: ConversationDocumentIdsSource): () => void;
    getPluginMessages(): readonly WorkspacePluginMessage[];
    subscribePluginMessages(listener: (messages: readonly WorkspacePluginMessage[]) => void): () => void;
    postPluginMessage(message: WorkspacePluginMessage | null): void;
    postHostEvent(event: WorkspaceHostEvent): void;
    subscribeHostEvent(listener: (event: WorkspaceHostEvent) => void): () => void;
}
