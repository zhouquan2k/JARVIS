import {
    HttpContextProvider,
    type FolderMetadata,
    type IContextProvider,
    resolveContextBaseUrl,
    type HttpContextProviderOptions,
    type ResolveContextBaseUrlOptions,
    type WorkspaceContext
} from '@packages/ui';

export interface CreateDesktop2ContextProviderOptions
    extends Pick<HttpContextProviderOptions, 'fetchImpl' | 'baseUrl'>,
        ResolveContextBaseUrlOptions {}

class DesktopBridgeContextProvider implements IContextProvider {
    public readonly id = 'desktop-bridge-context';

    private contextCache: WorkspaceContext | null = null;

    async initializeAccess(): Promise<void> {
        await window.chatprismDesktop!.initializeContextAccess();
        this.contextCache = null;
    }

    async getContext(): Promise<WorkspaceContext> {
        const context = await window.chatprismDesktop!.getContext();
        this.contextCache = context;
        return context;
    }

    async getFolderMetadata(path: string): Promise<FolderMetadata | null> {
        const context = this.contextCache ?? await this.getContext();
        const normalizedPath = path.endsWith('/') ? path : `${path}/`;
        return context.folderMetadata[path] ?? context.folderMetadata[normalizedPath] ?? null;
    }

    async getProjectDocuments(curNode: string) {
        return window.chatprismDesktop!.getProjectDocuments(curNode);
    }

    async readDocument(path: string) {
        return window.chatprismDesktop!.readContextDocument(path);
    }

    async writeDocument(input: Parameters<IContextProvider['writeDocument']>[0]) {
        return window.chatprismDesktop!.writeContextDocument(input);
    }

    async createNode(input: Parameters<IContextProvider['createNode']>[0]) {
        this.contextCache = null;
        return window.chatprismDesktop!.createContextNode(input);
    }

    async deleteNode(path: string): Promise<void> {
        this.contextCache = null;
        await window.chatprismDesktop!.deleteContextNode(path);
    }

    async renameNode(input: { path: string; name: string }) {
        this.contextCache = null;
        return window.chatprismDesktop!.renameContextNode(input);
    }

    async moveNode(input: Parameters<IContextProvider['moveNode']>[0]) {
        this.contextCache = null;
        return window.chatprismDesktop!.moveContextNode(input);
    }

    async searchInScope(request: Parameters<IContextProvider['searchInScope']>[0]) {
        return window.chatprismDesktop!.searchContextInScope(request);
    }

    async resolveDocumentIds(ids: string[]) {
        const result = await window.chatprismDesktop!.resolveDocumentIds(ids);
        return new Map(Object.entries(result));
    }

    async getDocumentId(path: string): Promise<string> {
        return window.chatprismDesktop!.getDocumentId(path);
    }
}

export function createDesktop2ContextProvider(
    options: CreateDesktop2ContextProviderOptions = {}
) {
    if (typeof window !== 'undefined' && window.chatprismDesktop) {
        return new DesktopBridgeContextProvider();
    }

    return new HttpContextProvider({
        baseUrl: options.baseUrl ?? resolveContextBaseUrl(options.env),
        fetchImpl: options.fetchImpl
    });
}

export { resolveContextBaseUrl };
