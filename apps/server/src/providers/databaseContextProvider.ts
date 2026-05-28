import type { TaskQueryTag } from '@packages/core';
import type {
    Conversation,
    ContextDocument,
    ContextNode,
    ContextSearchMatch,
    ContextSearchRequest,
    ContextProvider,
    CreateContextNodeInput,
    MoveContextNodeInput,
    RenameContextNodeInput,
    Task,
    WorkspaceContext,
    WriteContextDocumentInput,
    WriteContextDocumentResult
} from '../types/context.js';

function notImplemented(): never {
    throw new Error('DatabaseContextProvider is not implemented yet.');
}

export class DatabaseContextProvider implements ContextProvider {
    readonly id = 'database-context';
    private readonly taskProvider = {
        async getTasks(
            _documentPath?: string | null,
            _agentKey?: string | null,
            _completed?: boolean,
            _tag?: TaskQueryTag | null
        ): Promise<Task[]> {
            return [];
        },
        async createTask(_task: Task): Promise<Task> {
            notImplemented();
        },
        async updateTask(_task: Task): Promise<Task> {
            notImplemented();
        },
        async deleteTask(_taskId: string): Promise<void> {
            notImplemented();
        },
        async setTaskCompleted(_taskId: string, _completed: boolean): Promise<Task> {
            notImplemented();
        }
    };

    async initializeAccess(): Promise<void> {
        notImplemented();
    }

    async getContext(): Promise<WorkspaceContext> {
        notImplemented();
    }

    async getConversations(_query: { documentPath?: string }): Promise<Conversation[]> {
        return [];
    }

    getTaskProvider() {
        return this.taskProvider;
    }

    async getProjectDocuments(_curNode: string): Promise<Array<{ path: string; name: string }>> {
        return [];
    }

    async readDocument(_path: string): Promise<ContextDocument> {
        notImplemented();
    }

    async writeDocument(_input: WriteContextDocumentInput): Promise<WriteContextDocumentResult> {
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

    async moveNode(_input: MoveContextNodeInput): Promise<ContextNode> {
        notImplemented();
    }

    async searchInScope(_request: ContextSearchRequest): Promise<ContextSearchMatch[]> {
        throw new Error('DatabaseContextProvider does not support searchInScope yet.');
    }
}
