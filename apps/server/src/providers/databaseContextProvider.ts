import type {
    ContextDocument,
    ContextNode,
    ContextSearchMatch,
    ContextSearchRequest,
    ContextProvider,
    CreateContextNodeInput,
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

    async writeDocument(_path: string, _content: string): Promise<void> {
        notImplemented();
    }

    async createNode(_input: CreateContextNodeInput): Promise<ContextNode> {
        notImplemented();
    }

    async searchInScope(_request: ContextSearchRequest): Promise<ContextSearchMatch[]> {
        throw new Error('DatabaseContextProvider 暂不支持 searchInScope。');
    }

    async resolveScopedAgentConfig(_targetPath: string): Promise<ResolvedAgentConfig> {
        notImplemented();
    }
}
