import type { Conversation } from './Conversation';
import type { ConversationQuery } from './IConversationPersistProvider';
import type { ResolvedAgentConfig } from './IAgentConfig';
import type { ITaskProvider } from './ITaskProvider';

export const DEFAULT_WORKSPACE_AGENT_KEY = '/';

export interface ContextNode {
    path: string;
    name: string;
    kind: 'file' | 'directory';
    parentPath?: string;
    hasChildren?: boolean;
    updatedAt?: number;
    children?: ContextNode[];
    isAgentOwner?: boolean;
    agentKey: string;
}

export interface WorkspaceContext {
    nodes: ContextNode[];
    agentConfigs: Record<string, ResolvedAgentConfig>;
}

export interface ContextDocument {
    path: string;
    mimeType: string;
    dataBase64: string;
    updatedAt?: number;
    version?: string;
    canWrite?: boolean;
    /** Stable document identity (jarvis_id). Replaces documentPath-based lookup; documentPath kept for backward compat. */
    documentId?: string;
}

export interface WriteContextDocumentInput {
    path: string;
    mimeType: string;
    dataBase64: string;
    expectedVersion?: string;
}

export interface WriteContextDocumentResult {
    updatedAt?: number;
    version?: string;
}

export interface CreateContextNodeInput {
    parentPath?: string;
    name: string;
    kind: 'file' | 'directory';
}

export interface RenameContextNodeInput {
    path: string;
    name: string;
}

export interface MoveContextNodeInput {
    path: string;
    targetParentPath?: string;
}

export interface ContextSearchRequest {
    query: string;
    scopePath?: string;
    maxResults?: number;
}

export interface ContextSearchMatch {
    path: string;
    line: number;
    column: number;
    preview: string;
}

export interface ProjectDocumentEntry {
    path: string;
    name: string;
}

export interface IContextProvider {
    id: string;
    initializeAccess(): Promise<void>;
    getContext(): Promise<WorkspaceContext>;
    getConversations(query: ConversationQuery): Promise<Conversation[]>;
    getTaskProvider(): ITaskProvider;
    getProjectDocuments(curNode: string): Promise<ProjectDocumentEntry[]>;
    readDocument(path: string): Promise<ContextDocument>;
    writeDocument(input: WriteContextDocumentInput): Promise<WriteContextDocumentResult>;
    createNode(input: CreateContextNodeInput): Promise<ContextNode>;
    deleteNode(path: string): Promise<void>;
    renameNode(input: RenameContextNodeInput): Promise<ContextNode>;
    moveNode(input: MoveContextNodeInput): Promise<ContextNode>;
    searchInScope(request: ContextSearchRequest): Promise<ContextSearchMatch[]>;
    resolveDocumentIds(ids: string[]): Promise<Map<string, ContextNode | null>>;
    getDocumentId(path: string): Promise<string>;
}
