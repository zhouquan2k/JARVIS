import type {
    ContextDocument,
    ContextNode,
    ContextSearchMatch,
    ContextSearchRequest,
    CreateContextNodeInput,
    FolderMetadata,
    IContextProvider,
    MoveContextNodeInput,
    ProjectDocumentEntry,
    RenameContextNodeInput,
    WorkspaceContext,
    WriteContextDocumentInput,
    WriteContextDocumentResult
} from '@packages/core/src';

function getJarvisContextBridge() {
    if (!window.jarvisContext) {
        throw new Error('Desktop context bridge is unavailable.');
    }

    return window.jarvisContext;
}

export class IpcContextProvider implements IContextProvider {
    public readonly id = 'desktop-ipc-context';

    async initializeAccess(): Promise<void> {
        await getJarvisContextBridge().initializeAccess();
    }

    async getContext(): Promise<WorkspaceContext> {
        return getJarvisContextBridge().getContext();
    }

    async getFolderMetadata(path: string): Promise<FolderMetadata | null> {
        return getJarvisContextBridge().getFolderMetadata(path);
    }

    async getProjectDocuments(curNode: string): Promise<ProjectDocumentEntry[]> {
        return getJarvisContextBridge().getProjectDocuments(curNode);
    }

    async readDocument(path: string): Promise<ContextDocument> {
        return getJarvisContextBridge().readDocument(path);
    }

    async writeDocument(input: WriteContextDocumentInput): Promise<WriteContextDocumentResult> {
        return getJarvisContextBridge().writeDocument(input);
    }

    async createNode(input: CreateContextNodeInput): Promise<ContextNode> {
        return getJarvisContextBridge().createNode(input);
    }

    async deleteNode(path: string): Promise<void> {
        await getJarvisContextBridge().deleteNode(path);
    }

    async renameNode(input: RenameContextNodeInput): Promise<ContextNode> {
        return getJarvisContextBridge().renameNode(input);
    }

    async moveNode(input: MoveContextNodeInput): Promise<ContextNode> {
        return getJarvisContextBridge().moveNode(input);
    }

    async searchInScope(request: ContextSearchRequest): Promise<ContextSearchMatch[]> {
        return getJarvisContextBridge().searchInScope(request);
    }

    async getDocumentId(path: string): Promise<string> {
        return getJarvisContextBridge().getDocumentId(path);
    }

    async resolveDocumentIds(ids: string[]): Promise<Map<string, ContextNode | null>> {
        return new Map(Object.entries(await getJarvisContextBridge().resolveDocumentIds(ids)));
    }
}
