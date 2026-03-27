export interface ContextNode {
    path: string;
    name: string;
    kind: 'file' | 'directory';
    parentPath?: string;
    hasChildren?: boolean;
    updatedAt?: number;
}

export interface ContextDocument {
    path: string;
    content: string;
    updatedAt?: number;
    version?: string;
}

export interface CreateContextNodeInput {
    parentPath?: string;
    name: string;
    kind: 'file' | 'directory';
}

export interface ContextProvider {
    id: string;
    initializeAccess(): Promise<void>;
    listTree(parentPath?: string): Promise<ContextNode[]>;
    readDocument(path: string): Promise<ContextDocument>;
    writeDocument(path: string, content: string): Promise<void>;
    createNode(input: CreateContextNodeInput): Promise<ContextNode>;
}

