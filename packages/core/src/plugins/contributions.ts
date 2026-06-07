import type { IContextProvider } from '../interfaces/IContextProvider';
import type { ContextDocument, ContextNode, FolderMetadata } from '../interfaces/IContextProvider';
import type { WorkspaceRuntimeContext } from './WorkspaceRuntimeContext';

export interface GlobalViewContribution<TComponent = unknown> {
    id: string;
    routePath: string;
    routeName: string;
    label: string;
    labelKey?: string;
    component: TComponent;
    order?: number;
    workspaceMode?: 'agent' | 'conversation';
}

export interface RightPanelTabContribution<TComponent = unknown> {
    id: string;
    title: string;
    titleKey?: string;
    component: TComponent;
    order?: number;
    defaultActive?: boolean;
    getBadgeCount?(input: WorkspaceTabContext): number | Promise<number>;
    shouldAutoActivate?(input: WorkspaceTabContext): boolean;
}

export interface WorkspaceTabContext {
    activeScopeMetadata: FolderMetadata | null;
    activeScopeKey: string | null;
    activePath: string | null;
    selectedNodePath: string | null;
    activeDocument: ContextDocument | null;
    contextProvider: IContextProvider | null;
    runtimeContext: WorkspaceRuntimeContext | null;
    restoreConversationId?: string | null;
    openConversationId?: string | null;
    openConversationNonce?: number | null;
    showAgentConversationList?: boolean;
}

export interface WorkspaceSelectionViewInput {
    selectedNode: ContextNode | null;
    selectedOwnerNode: ContextNode | null;
    activePath: string | null;
    activeScopeKey: string | null;
    activeScopeMetadata: FolderMetadata | null;
    contextProvider: IContextProvider | null;
}

export interface WorkspaceSelectionViewContribution<TComponent = unknown> {
    id: string;
    component: TComponent;
    order?: number;
    matches(input: WorkspaceSelectionViewInput): boolean;
}

export interface InsertLinkContext {
    activePath: string | null;
    activeDocument: ContextDocument | null;
    activeScopeMetadata: FolderMetadata | null;
    activeScopeKey: string | null;
    selectedNodePath: string | null;
    contextProvider: IContextProvider | null;
}

export interface InsertLinkItem {
    id: string;
    title: string;
    markdown: string;
}

export interface InsertLinkTypeContribution {
    id: string;
    title: string;
    titleKey?: string;
    order?: number;
    supports(input: InsertLinkContext): boolean;
    getRefreshKey?(input: InsertLinkContext): unknown;
    getItems(input: InsertLinkContext): Promise<InsertLinkItem[]> | InsertLinkItem[];
}

export interface DocumentImportHostApi {
    createDocument(path: string, content: string): Promise<void>;
    createReferenceResource(
        ownerDocumentPath: string,
        filename: string,
        content: string
    ): Promise<{ resourcePath: string; relativePathFromOwner: string }>;
    openDocument(path: string): Promise<void>;
    report(message: { type: 'success' | 'error'; text: string }): void;
    setStage(stage: {
        key: string;
        label: string;
        status: 'running' | 'completed' | 'failed';
        detail?: string;
    }): void;
}

export interface DocumentImportRunInput<TParams = unknown> {
    params: TParams;
    targetParentPath: string;
    hostApi: DocumentImportHostApi;
    signal?: AbortSignal;
}

export interface DocumentImportResult {
    primaryDocumentPath: string;
    createdPaths: string[];
}

export interface DocumentImportFormProps<TParams = unknown> {
    modelValue: TParams;
    languageModels: readonly LanguageModelContribution[];
    disabled?: boolean;
}

export interface DocumentImportContribution<TParams = unknown, TComponent = unknown> {
    id: string;
    title: string;
    icon?: string;
    formComponent: TComponent;
    titleKey?: string;
    order?: number;
    createInitialParams?(): TParams;
    run(input: DocumentImportRunInput<TParams>): Promise<DocumentImportResult>;
}

export interface LanguageModelContribution {
    id: string;
    generateText(
        prompt: string,
        options?: {
            system?: string;
            signal?: AbortSignal;
        }
    ): Promise<string>;
}

export type NodePresentationIcon = 'bot';

export type NodePresentationAccentTone = 'primary' | 'muted' | 'success' | 'warning' | 'danger';

export interface NodePresentationResult {
    icon?: NodePresentationIcon;
    badge?: string;
    labelSuffix?: string;
    accentTone?: NodePresentationAccentTone;
}

export interface NodePresentationContribution {
    id: string;
    priority?: number;
    supports(node: ContextNode): boolean | Promise<boolean>;
    getPresentation(node: ContextNode): NodePresentationResult | null | Promise<NodePresentationResult | null>;
}
