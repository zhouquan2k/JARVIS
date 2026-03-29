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

export type AgentInheritanceMode = 'merge' | 'override';

export interface AgentToolBinding {
    id: string;
    description?: string;
}

export interface AgentSkillBinding {
    id: string;
    description?: string;
}

export interface AgentConfig {
    name: string;
    description?: string;
    instructions?: string;
    modelProviderName?: string;
    modelName?: string;
    tools?: AgentToolBinding[];
    skills?: AgentSkillBinding[];
    inheritance?: AgentInheritanceMode;
}

export interface ResolvedAgentConfig extends AgentConfig {
    scopePath: string;
    sourcePaths: string[];
    effectiveInstructions: string;
}

export interface ContextProvider {
    id: string;
    initializeAccess(): Promise<void>;
    listTree(parentPath?: string): Promise<ContextNode[]>;
    readDocument(path: string): Promise<ContextDocument>;
    writeDocument(path: string, content: string): Promise<void>;
    createNode(input: CreateContextNodeInput): Promise<ContextNode>;
    searchInScope(request: ContextSearchRequest): Promise<ContextSearchMatch[]>;
    resolveScopedAgentConfig(targetPath: string): Promise<ResolvedAgentConfig>;
}
