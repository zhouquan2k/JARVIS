import { ipcMain } from 'electron';
import type {
    ContextSearchRequest,
    CreateContextNodeInput,
    IContextProvider,
    MoveContextNodeInput,
    RenameContextNodeInput,
    WriteContextDocumentInput
} from '@packages/core/src';
import { FileSystemContextProvider } from '../../../packages/node/src/context/FileSystemContextProvider.ts';
import {
    DESKTOP_CONTEXT_BRIDGE_METHODS,
    DESKTOP_CONTEXT_CHANNELS
} from '../shared/contextBridge';

interface IpcHandlerRegistry {
    handle(channel: string, listener: (...args: any[]) => unknown): void;
    removeHandler(channel: string): void;
}

export interface RegisterContextProviderIpcOptions {
    ipc?: IpcHandlerRegistry;
    knowledgeRoot?: string;
    provider?: IContextProvider;
}

export function createDesktopMainContextProvider(knowledgeRoot?: string): IContextProvider {
    return new FileSystemContextProvider({
        rootPath: knowledgeRoot
    });
}

export function registerContextProviderIpc(options: RegisterContextProviderIpcOptions = {}) {
    const ipc = options.ipc ?? ipcMain;
    const provider = options.provider ?? createDesktopMainContextProvider(options.knowledgeRoot);

    ipc.handle(DESKTOP_CONTEXT_CHANNELS.initializeAccess, async () => {
        await provider.initializeAccess();
    });
    ipc.handle(DESKTOP_CONTEXT_CHANNELS.getContext, async () => {
        return provider.getContext();
    });
    ipc.handle(DESKTOP_CONTEXT_CHANNELS.getFolderMetadata, async (_event, targetPath: string) => {
        return provider.getFolderMetadata(targetPath);
    });
    ipc.handle(DESKTOP_CONTEXT_CHANNELS.getProjectDocuments, async (_event, curNode: string) => {
        return provider.getProjectDocuments(curNode);
    });
    ipc.handle(DESKTOP_CONTEXT_CHANNELS.readDocument, async (_event, targetPath: string) => {
        return provider.readDocument(targetPath);
    });
    ipc.handle(DESKTOP_CONTEXT_CHANNELS.writeDocument, async (_event, input: WriteContextDocumentInput) => {
        return provider.writeDocument(input);
    });
    ipc.handle(DESKTOP_CONTEXT_CHANNELS.createNode, async (_event, input: CreateContextNodeInput) => {
        return provider.createNode(input);
    });
    ipc.handle(DESKTOP_CONTEXT_CHANNELS.deleteNode, async (_event, targetPath: string) => {
        await provider.deleteNode(targetPath);
    });
    ipc.handle(DESKTOP_CONTEXT_CHANNELS.renameNode, async (_event, input: RenameContextNodeInput) => {
        return provider.renameNode(input);
    });
    ipc.handle(DESKTOP_CONTEXT_CHANNELS.moveNode, async (_event, input: MoveContextNodeInput) => {
        return provider.moveNode(input);
    });
    ipc.handle(DESKTOP_CONTEXT_CHANNELS.searchInScope, async (_event, request: ContextSearchRequest) => {
        return provider.searchInScope(request);
    });
    ipc.handle(DESKTOP_CONTEXT_CHANNELS.getDocumentId, async (_event, targetPath: string) => {
        return provider.getDocumentId(targetPath);
    });
    ipc.handle(DESKTOP_CONTEXT_CHANNELS.resolveDocumentIds, async (_event, ids: string[]) => {
        const result = await provider.resolveDocumentIds(ids);
        return Object.fromEntries(result);
    });

    return () => {
        for (const method of DESKTOP_CONTEXT_BRIDGE_METHODS) {
            ipc.removeHandler(DESKTOP_CONTEXT_CHANNELS[method]);
        }
    };
}
