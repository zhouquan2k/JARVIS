import { ipcMain } from 'electron';
import { type ContextSearchRequest, type IContextProvider, type WriteContextDocumentInput } from '@packages/core/src';
import { HttpContextProvider } from '@packages/ui/src/context/HttpContextProvider';
import {
    DESKTOP_CONTEXT_CREATE_NODE_CHANNEL,
    DESKTOP_CONTEXT_DELETE_NODE_CHANNEL,
    DESKTOP_CONTEXT_GET_CONTEXT_CHANNEL,
    DESKTOP_CONTEXT_GET_PROJECT_DOCUMENTS_CHANNEL,
    DESKTOP_CONTEXT_INITIALIZE_CHANNEL,
    DESKTOP_CONTEXT_MOVE_NODE_CHANNEL,
    DESKTOP_CONTEXT_READ_DOCUMENT_CHANNEL,
    DESKTOP_CONTEXT_RENAME_NODE_CHANNEL,
    DESKTOP_CONTEXT_SEARCH_IN_SCOPE_CHANNEL,
    DESKTOP_CONTEXT_WRITE_DOCUMENT_CHANNEL,
    DESKTOP_CONTEXT_GET_DOCUMENT_ID_CHANNEL,
    DESKTOP_CONTEXT_RESOLVE_DOCUMENT_IDS_CHANNEL
} from '../shared/contextBridge';

interface IpcHandlerRegistry {
    handle(channel: string, listener: (...args: any[]) => unknown): void;
    removeHandler(channel: string): void;
}

interface RegisterContextIpcOptions {
    ipc?: IpcHandlerRegistry;
    contextBaseUrl?: string;
    fetchImpl?: typeof fetch;
}

function createDesktopMainContextProvider(options: {
    contextBaseUrl?: string;
    fetchImpl?: typeof fetch;
}): IContextProvider {
    const contextBaseUrl = options.contextBaseUrl?.trim();
    if (!contextBaseUrl) {
        throw new Error('Desktop HTTP context provider is not configured. Set CHATPRISM_CONTEXT_BASE_URL.');
    }

    console.info(`[desktop-context] using HTTP context provider: ${contextBaseUrl}`);
    return new HttpContextProvider({
        baseUrl: contextBaseUrl,
        fetchImpl: options.fetchImpl
    });
}

export function registerContextIpc(options: RegisterContextIpcOptions = {}) {
    const ipc = options.ipc ?? ipcMain;
    const provider = createDesktopMainContextProvider({
        contextBaseUrl: options.contextBaseUrl,
        fetchImpl: options.fetchImpl
    });

    ipc.handle(DESKTOP_CONTEXT_INITIALIZE_CHANNEL, async () => {
        await provider.initializeAccess();
    });
    ipc.handle(DESKTOP_CONTEXT_GET_CONTEXT_CHANNEL, async () => {
        return provider.getContext();
    });
    ipc.handle(DESKTOP_CONTEXT_GET_PROJECT_DOCUMENTS_CHANNEL, async (_event, curNode: string) => {
        return provider.getProjectDocuments(curNode);
    });
    ipc.handle(DESKTOP_CONTEXT_READ_DOCUMENT_CHANNEL, async (_event, targetPath: string) => {
        return provider.readDocument(targetPath);
    });
    ipc.handle(DESKTOP_CONTEXT_WRITE_DOCUMENT_CHANNEL, async (_event, input: WriteContextDocumentInput) => {
        return provider.writeDocument(input);
    });
    ipc.handle(DESKTOP_CONTEXT_CREATE_NODE_CHANNEL, async (_event, input: { parentPath?: string; name: string; kind: 'file' | 'directory' }) => {
        return provider.createNode(input);
    });
    ipc.handle(DESKTOP_CONTEXT_DELETE_NODE_CHANNEL, async (_event, targetPath: string) => {
        await provider.deleteNode(targetPath);
    });
    ipc.handle(DESKTOP_CONTEXT_RENAME_NODE_CHANNEL, async (_event, input: { path: string; name: string }) => {
        return provider.renameNode(input);
    });
    ipc.handle(DESKTOP_CONTEXT_MOVE_NODE_CHANNEL, async (_event, input: { path: string; targetParentPath?: string }) => {
        return provider.moveNode(input);
    });
    ipc.handle(DESKTOP_CONTEXT_SEARCH_IN_SCOPE_CHANNEL, async (_event, request: ContextSearchRequest) => {
        return provider.searchInScope(request);
    });
    ipc.handle(DESKTOP_CONTEXT_GET_DOCUMENT_ID_CHANNEL, async (_event, docPath: string) => {
        return provider.getDocumentId(docPath);
    });
    ipc.handle(DESKTOP_CONTEXT_RESOLVE_DOCUMENT_IDS_CHANNEL, async (_event, ids: string[]) => {
        const result = await provider.resolveDocumentIds(ids);
        return Object.fromEntries(result);
    });

    return () => {
        ipc.removeHandler(DESKTOP_CONTEXT_INITIALIZE_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_GET_CONTEXT_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_GET_PROJECT_DOCUMENTS_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_READ_DOCUMENT_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_SEARCH_IN_SCOPE_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_WRITE_DOCUMENT_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_CREATE_NODE_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_DELETE_NODE_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_RENAME_NODE_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_MOVE_NODE_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_GET_DOCUMENT_ID_CHANNEL);
        ipc.removeHandler(DESKTOP_CONTEXT_RESOLVE_DOCUMENT_IDS_CHANNEL);
    };
}
