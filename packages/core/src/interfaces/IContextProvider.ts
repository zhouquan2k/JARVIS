export const DEFAULT_WORKSPACE_SCOPE_KEY = '/';

/**
 * 文件夹级别的不透明元数据。core 不解释 `data` 的内容；具体语义（如 AI agent 配置）
 * 由消费该元数据的插件解释。`scopeKey` 标识携带该元数据的作用域文件夹。
 */
export interface FolderMetadata {
    scopeKey: string;
    data: Record<string, unknown>;
}

export interface ContextNode {
    path: string;
    name: string;
    kind: 'file' | 'directory';
    parentPath?: string;
    hasChildren?: boolean;
    updatedAt?: number;
    children?: ContextNode[];
    /** 该节点自身是否是一个携带元数据的作用域文件夹。 */
    ownsMetadata?: boolean;
    /** 该节点所归属的最近作用域文件夹（携带元数据的祖先）的键。 */
    scopeKey: string;
}

export interface WorkspaceContext {
    nodes: ContextNode[];
    /** 以 scopeKey 索引的文件夹元数据；内容不透明，由插件解释。 */
    folderMetadata: Record<string, FolderMetadata>;
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
    getFolderMetadata(path: string): Promise<FolderMetadata | null>;
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
