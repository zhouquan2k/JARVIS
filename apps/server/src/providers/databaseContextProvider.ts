import type {
    Conversation,
    ContextDocument,
    ContextNode,
    ContextSearchMatch,
    ContextSearchRequest,
    ContextProvider,
    CreateContextNodeInput,
    RenameContextNodeInput,
    WorkspaceContext
} from '../types/context.js';

function notImplemented(): never {
    throw new Error('DatabaseContextProvider 尚未实现。');
}

export class DatabaseContextProvider implements ContextProvider {
    readonly id = 'database-context';

    async initializeAccess(): Promise<void> {
        notImplemented();
    }

    async getContext(): Promise<WorkspaceContext> {
        notImplemented();
    }

    async getConversations(_query: { documentPath?: string }): Promise<Conversation[]> {
        return [];
    }

    async readDocument(_path: string): Promise<ContextDocument> {
        notImplemented();
    }

    async writeDocument(_input: { path: string; mimeType: string; dataBase64: string; expectedVersion?: string }): Promise<void> {
        notImplemented();
    }

    async createNode(_input: CreateContextNodeInput): Promise<ContextNode> {
        notImplemented();
    }

    async deleteNode(_path: string): Promise<void> {
        notImplemented();
    }

    async renameNode(_input: RenameContextNodeInput): Promise<ContextNode> {
        notImplemented();
    }

    async searchInScope(_request: ContextSearchRequest): Promise<ContextSearchMatch[]> {
        throw new Error('DatabaseContextProvider 暂不支持 searchInScope。');
    }
}
