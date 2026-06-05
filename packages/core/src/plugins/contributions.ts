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

export interface DocumentCreationFlowInput {
    targetParentPath?: string;
}

export interface DocumentCreationFlowResult {
    createdDocumentPath: string;
}

export interface DocumentCreationFlowContribution {
    id: string;
    title: string;
    titleKey?: string;
    order?: number;
    run(input: DocumentCreationFlowInput): Promise<DocumentCreationFlowResult>;
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
