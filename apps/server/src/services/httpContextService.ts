import type { Conversation, ConversationQuery, Task, TaskQueryTag } from '@packages/core';
import type {
    ContextDocument,
    ContextNode,
    ProjectDocumentEntry,
    ContextSearchMatch,
    ContextSearchRequest,
    ContextProvider,
    CreateContextNodeInput,
    MoveContextNodeInput,
    RenameContextNodeInput,
    WorkspaceContext,
    WriteContextDocumentInput,
    WriteContextDocumentResult
} from '../types/context.js';

export class HttpContextService {
    constructor(private readonly provider: ContextProvider) {}

    async initializeAccess(): Promise<void> {
        await this.provider.initializeAccess();
    }

    async getContext(): Promise<WorkspaceContext> {
        return this.provider.getContext();
    }

    async getConversations(query: ConversationQuery): Promise<Conversation[]> {
        return this.provider.getConversations(query);
    }

    async getTasks(
        documentPath?: string | null,
        agentKey?: string | null,
        completed?: boolean,
        tag?: TaskQueryTag | null
    ): Promise<Task[]> {
        return this.provider.getTaskProvider().getTasks(documentPath, agentKey, completed, tag);
    }

    async createTask(task: Task): Promise<Task> {
        return this.provider.getTaskProvider().createTask(task);
    }

    async updateTask(task: Task): Promise<Task> {
        return this.provider.getTaskProvider().updateTask(task);
    }

    async deleteTask(taskId: string): Promise<void> {
        await this.provider.getTaskProvider().deleteTask(taskId);
    }

    async setTaskCompleted(taskId: string, completed: boolean): Promise<Task> {
        return this.provider.getTaskProvider().setTaskCompleted(taskId, completed);
    }

    async getProjectDocuments(curNode: string): Promise<ProjectDocumentEntry[]> {
        return this.provider.getProjectDocuments(curNode);
    }

    async readDocument(path: string): Promise<ContextDocument> {
        return this.provider.readDocument(path);
    }

    async writeDocument(input: WriteContextDocumentInput): Promise<WriteContextDocumentResult> {
        return this.provider.writeDocument(input);
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

    async moveNode(input: MoveContextNodeInput): Promise<ContextNode> {
        return this.provider.moveNode(input);
    }

    async searchInScope(request: ContextSearchRequest): Promise<ContextSearchMatch[]> {
        return this.provider.searchInScope(request);
    }
}
