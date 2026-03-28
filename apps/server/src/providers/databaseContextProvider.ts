import type {
    ContextDocument,
    ContextNode,
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

    async resolveScopedAgentConfig(_targetPath: string): Promise<ResolvedAgentConfig> {
        notImplemented();
    }
}
