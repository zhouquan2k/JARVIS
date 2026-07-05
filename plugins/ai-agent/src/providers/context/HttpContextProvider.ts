import {
    DEFAULT_CONTEXT_BASE_URL,
    resolveContextBaseUrl,
    type ResolveContextBaseUrlOptions
} from '@packages/core/config';
import type { Conversation } from '../../interfaces/Conversation';
import type { ConversationQuery } from '../../interfaces/IConversationPersistProvider';
import type {
    ContextDocument,
    ContextNode,
    ProjectDocumentEntry,
    ContextSearchMatch,
    ContextSearchRequest,
    CreateContextNodeInput,
    FolderMetadata,
    IContextProvider,
    MoveContextNodeInput,
    RenameContextNodeInput,
    WriteContextDocumentResult,
    WorkspaceContext,
    WriteContextDocumentInput
} from '@plugins/ai-agent/src/internal';
import { HttpApiClient } from '@plugins/ai-agent/src/internal';

export interface HttpContextProviderOptions {
    baseUrl?: string;
    fetchImpl?: typeof fetch;
}

export { DEFAULT_CONTEXT_BASE_URL, resolveContextBaseUrl };
export type { ResolveContextBaseUrlOptions };

function normalizeBaseUrl(value?: string): string {
    const normalized = value?.trim();
    return (normalized ? normalized : DEFAULT_CONTEXT_BASE_URL).replace(/\/+$/, '');
}

export class HttpContextProvider implements IContextProvider {
    readonly id = 'http-context';
    private readonly client: HttpApiClient;

    constructor(options: HttpContextProviderOptions = {}) {
        if (!options.fetchImpl && typeof fetch === 'undefined') {
            throw new Error('The current environment does not support fetch.');
        }

        this.client = new HttpApiClient({
            baseUrl: normalizeBaseUrl(options.baseUrl),
            fetchImpl: options.fetchImpl,
            source: 'context'
        });
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

    async getFolderMetadata(path: string): Promise<FolderMetadata | null> {
        const response = await this.post('/get-folder-metadata', { path });
        return (response as { folderMetadata: FolderMetadata | null }).folderMetadata ?? null;
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

    async getDocumentId(docPath: string): Promise<string> {
        const response = await this.post('/get-document-id', { path: docPath });
        return (response as { id: string }).id;
    }

    async resolveDocumentIds(ids: string[]): Promise<Map<string, ContextNode | null>> {
        const response = await this.post('/resolve-document-ids', { ids });
        const resolved = (response as { resolved: Record<string, ContextNode | null> }).resolved;
        return new Map(Object.entries(resolved));
    }

    private async post(path: string, body: Record<string, unknown>): Promise<unknown> {
        return this.client.postJson(path, body);
    }
}
