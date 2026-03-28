import type {
    ContextDocument,
    ContextNode,
    ContextProvider,
    CreateContextNodeInput,
    ResolvedAgentConfig
} from '../types/context.js';

export class HttpContextService {
    constructor(private readonly provider: ContextProvider) {}

    async initializeAccess(): Promise<void> {
        await this.provider.initializeAccess();
    }

    async listTree(parentPath?: string): Promise<ContextNode[]> {
        return this.provider.listTree(parentPath);
    }

    async readDocument(path: string): Promise<ContextDocument> {
        return this.provider.readDocument(path);
    }

    async writeDocument(path: string, content: string): Promise<void> {
        await this.provider.writeDocument(path, content);
    }

    async createNode(input: CreateContextNodeInput): Promise<ContextNode> {
        return this.provider.createNode(input);
    }

    async resolveScopedAgentConfig(targetPath: string): Promise<ResolvedAgentConfig> {
        return this.provider.resolveScopedAgentConfig(targetPath);
    }
}
