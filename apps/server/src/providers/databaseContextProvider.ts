import type {
    ContextDocument,
    ContextNode,
    ContextSearchMatch,
    ContextSearchRequest,
    ContextProvider,
    CreateContextNodeInput,
    RenameContextNodeInput,
    ResolvedAgentConfig
} from '../types/context.js';

function notImplemented(): never {
    throw new Error('DatabaseContextProvider 尚未实现。');
}

export class DatabaseContextProvider implements ContextProvider {
    readonly id = 'database-context';

    async initializeAccess(): Promise<void> {
        notImplemented();
    }

    async listTree(_parentPath?: string): Promise<ContextNode[]> {
        notImplemented();
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

    async resolveScopedAgentConfig(_targetPath: string): Promise<ResolvedAgentConfig> {
        notImplemented();
    }
}
