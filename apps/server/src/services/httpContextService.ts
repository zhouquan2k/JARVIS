import type {
    ContextDocument,
    ContextNode,
    ContextSearchMatch,
    ContextSearchRequest,
    ContextProvider,
    CreateContextNodeInput,
    RenameContextNodeInput,
    WorkspaceContext,
    WriteContextDocumentInput
} from '../types/context.js';

export class HttpContextService {
    constructor(private readonly provider: ContextProvider) {}

    async initializeAccess(): Promise<void> {
        await this.provider.initializeAccess();
    }

    async getContext(): Promise<WorkspaceContext> {
        return this.provider.getContext();
    }

    async readDocument(path: string): Promise<ContextDocument> {
        return this.provider.readDocument(path);
    }

    async writeDocument(input: WriteContextDocumentInput): Promise<void> {
        await this.provider.writeDocument(input);
    }

    async createNode(input: CreateContextNodeInput): Promise<ContextNode> {
        return this.provider.createNode(input);
    }

    async deleteNode(path: string): Promise<void> {
        await this.provider.deleteNode(path);
    }

    async renameNode(input: RenameContextNodeInput): Promise<ContextNode> {
        return this.provider.renameNode(input);
    }

    async searchInScope(request: ContextSearchRequest): Promise<ContextSearchMatch[]> {
        return this.provider.searchInScope(request);
    }
}
