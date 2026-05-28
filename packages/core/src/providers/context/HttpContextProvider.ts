import { DEFAULT_SYNC_BASE_URL, resolveSyncBaseUrl } from '../../../config';
import type { Conversation } from '../../interfaces/Conversation';
import type { ConversationQuery } from '../../interfaces/IConversationPersistProvider';
import type { ITaskProvider, Task, TaskQueryTag } from '../../interfaces/ITaskProvider';
import type {
    ContextDocument,
    ContextNode,
    ProjectDocumentEntry,
    ContextSearchMatch,
    ContextSearchRequest,
    CreateContextNodeInput,
    IContextProvider,
    MoveContextNodeInput,
    RenameContextNodeInput,
    WriteContextDocumentResult,
    WorkspaceContext,
    WriteContextDocumentInput
} from '../../interfaces/IContextProvider';
import { HttpApiClient } from '../http/HttpApiClient';

export const DEFAULT_CONTEXT_BASE_URL = 'http://127.0.0.1:8787/api/context';

export interface HttpContextProviderOptions {
    baseUrl?: string;
    fetchImpl?: typeof fetch;
}

export interface ResolveContextBaseUrlOptions {
    env?: Record<string, string | undefined>;
}

function hasEnvContainer(
    value: ResolveContextBaseUrlOptions | Record<string, string | undefined>
): value is ResolveContextBaseUrlOptions {
    return 'env' in value;
}

function normalizeBaseUrl(value?: string): string {
    const normalized = value?.trim();
    return (normalized ? normalized : DEFAULT_CONTEXT_BASE_URL).replace(/\/+$/, '');
}

export function resolveContextBaseUrl(
    options: ResolveContextBaseUrlOptions | Record<string, string | undefined> = {}
): string {
    const env = hasEnvContainer(options) ? options.env : options;
    const explicit = env?.CHATPRISM_CONTEXT_BASE_URL?.trim()
        || env?.VITE_CONTEXT_BASE_URL?.trim()
        || env?.WXT_CONTEXT_BASE_URL?.trim();
    if (explicit) {
        return explicit.replace(/\/+$/, '');
    }

    const syncBaseUrl = resolveSyncBaseUrl({ env });
    if (syncBaseUrl !== DEFAULT_SYNC_BASE_URL && syncBaseUrl.endsWith('/api/sync')) {
        return `${syncBaseUrl.slice(0, -'/api/sync'.length)}/api/context`;
    }

    return DEFAULT_CONTEXT_BASE_URL;
}

export class HttpContextProvider implements IContextProvider {
    readonly id = 'http-context';
    private readonly client: HttpApiClient;
    private readonly taskProvider: ITaskProvider;

    constructor(options: HttpContextProviderOptions = {}) {
        if (!options.fetchImpl && typeof fetch === 'undefined') {
            throw new Error('The current environment does not support fetch.');
        }

        this.client = new HttpApiClient({
            baseUrl: normalizeBaseUrl(options.baseUrl),
            fetchImpl: options.fetchImpl,
            source: 'context'
        });
        this.taskProvider = {
            getTasks: async (
                documentPath?: string | null,
                agentKey?: string | null,
                completed?: boolean,
                tag?: TaskQueryTag | null
            ) => {
                const response = await this.post('/get-tasks', { documentPath, agentKey, completed, tag });
                return (response as { tasks: Task[] }).tasks;
            },
            createTask: async (task: Task) => {
                const response = await this.post('/create-task', { task });
                return (response as { task: Task }).task;
            },
            updateTask: async (task: Task) => {
                const response = await this.post('/update-task', { task });
                return (response as { task: Task }).task;
            },
            deleteTask: async (taskId: string) => {
                await this.post('/delete-task', { taskId });
            },
            setTaskCompleted: async (taskId: string, completed: boolean) => {
                const response = await this.post('/set-task-completed', { taskId, completed });
                return (response as { task: Task }).task;
            }
        };
    }

    async initializeAccess(): Promise<void> {
        await this.post('/initialize-access', {});
    }

    async getContext(): Promise<WorkspaceContext> {
        const response = await this.post('/get-context', {});
        return response as WorkspaceContext;
    }

    async getConversations(query: ConversationQuery): Promise<Conversation[]> {
        const response = await this.post('/get-conversations', { ...query });
        return (response as { conversations: Conversation[] }).conversations;
    }

    getTaskProvider(): ITaskProvider {
        return this.taskProvider;
    }

    async getProjectDocuments(curNode: string): Promise<ProjectDocumentEntry[]> {
        const response = await this.post('/get-project-documents', { curNode });
        return (response as { documents: ProjectDocumentEntry[] }).documents;
    }

    async readDocument(path: string): Promise<ContextDocument> {
        const response = await this.post('/read-document', { path });
        return (response as { document: ContextDocument }).document;
    }

    async writeDocument(input: WriteContextDocumentInput): Promise<WriteContextDocumentResult> {
        const response = await this.post('/write-document', { ...input });
        if (response && typeof response === 'object' && 'result' in response) {
            return (response as { result: WriteContextDocumentResult }).result ?? {};
        }

        return {};
    }

    async createNode(input: CreateContextNodeInput): Promise<ContextNode> {
        const response = await this.post('/create-node', { ...input });
        return (response as { node: ContextNode }).node;
    }

    async deleteNode(path: string): Promise<void> {
        await this.post('/delete-node', { path });
    }

    async renameNode(input: RenameContextNodeInput): Promise<ContextNode> {
        const response = await this.post('/rename-node', { ...input });
        return (response as { node: ContextNode }).node;
    }

    async moveNode(input: MoveContextNodeInput): Promise<ContextNode> {
        const response = await this.post('/move-node', { ...input });
        return (response as { node: ContextNode }).node;
    }

    async searchInScope(request: ContextSearchRequest): Promise<ContextSearchMatch[]> {
        const response = await this.post('/search-in-scope', { ...request });
        return (response as { matches: ContextSearchMatch[] }).matches;
    }

    private async post(path: string, body: Record<string, unknown>): Promise<unknown> {
        return this.client.postJson(path, body);
    }
}
