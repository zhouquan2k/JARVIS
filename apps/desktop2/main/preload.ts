import { contextBridge, ipcRenderer } from 'electron';
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
import {
    DESKTOP_PROVIDER_LOGIN_COMPLETED_CHANNEL,
    DESKTOP_PROVIDER_LOGIN_CLOSED_CHANNEL,
    DESKTOP_PROVIDER_LOGIN_OPEN_CHANNEL,
    DESKTOP_PROVIDER_LOGIN_OPENED_CHANNEL,
    type ProviderLoginEventPayload
} from '../shared/authBridge';
import {
    DESKTOP_CONTROLLED_PAGE_EVALUATE_CHANNEL,
    DESKTOP_CONTROLLED_PAGE_OPEN_CHANNEL,
    type EvaluateInControlledPageRequest,
    type OpenControlledPageRequest
} from '../shared/controlledPageBridge';
import {
    DESKTOP_BROWSER_AUTOMATION_FETCH_CHANNEL,
    DESKTOP_BROWSER_AUTOMATION_GET_COOKIE_CHANNEL,
    type BrowserAutomationCookieRequest,
    type BrowserAutomationFetchRequest
} from '../shared/browserAutomationBridge';

contextBridge.exposeInMainWorld('chatprismDesktop', {
    runtimeEnv: {
        contextBaseUrl: process.env.CHATPRISM_CONTEXT_BASE_URL
    },
    initializeContextAccess() {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_INITIALIZE_CHANNEL);
    },
    getContext() {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_GET_CONTEXT_CHANNEL);
    },
    getProjectDocuments(curNode: string) {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_GET_PROJECT_DOCUMENTS_CHANNEL, curNode);
    },
    readContextDocument(path: string) {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_READ_DOCUMENT_CHANNEL, path);
    },
    writeContextDocument(input: { path: string; mimeType: string; dataBase64: string; expectedVersion?: string }) {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_WRITE_DOCUMENT_CHANNEL, input);
    },
    createContextNode(input: { parentPath?: string; name: string; kind: 'file' | 'directory' }) {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_CREATE_NODE_CHANNEL, input);
    },
    deleteContextNode(path: string) {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_DELETE_NODE_CHANNEL, path);
    },
    renameContextNode(input: { path: string; name: string }) {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_RENAME_NODE_CHANNEL, input);
    },
    moveContextNode(input: { path: string; targetParentPath?: string }) {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_MOVE_NODE_CHANNEL, input);
    },
    searchContextInScope(request: { query: string; scopePath?: string; maxResults?: number }) {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_SEARCH_IN_SCOPE_CHANNEL, request);
    },
    getDocumentId(docPath: string) {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_GET_DOCUMENT_ID_CHANNEL, docPath);
    },
    resolveDocumentIds(ids: string[]) {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_RESOLVE_DOCUMENT_IDS_CHANNEL, ids);
    },
    openProviderLoginWindow(providerId: string) {
        return ipcRenderer.invoke(DESKTOP_PROVIDER_LOGIN_OPEN_CHANNEL, providerId);
    },
    openControlledPage(request: OpenControlledPageRequest) {
        return ipcRenderer.invoke(DESKTOP_CONTROLLED_PAGE_OPEN_CHANNEL, request);
    },
    evaluateInControlledPage<T>(request: EvaluateInControlledPageRequest) {
        return ipcRenderer.invoke(DESKTOP_CONTROLLED_PAGE_EVALUATE_CHANNEL, request) as Promise<T>;
    },
    browserAutomationFetch(request: BrowserAutomationFetchRequest) {
        return ipcRenderer.invoke(DESKTOP_BROWSER_AUTOMATION_FETCH_CHANNEL, request);
    },
    browserAutomationGetCookie(request: BrowserAutomationCookieRequest) {
        return ipcRenderer.invoke(DESKTOP_BROWSER_AUTOMATION_GET_COOKIE_CHANNEL, request);
    },
    onProviderLoginWindowOpened(listener: (providerId: string) => void) {
        const wrapped = (_event: Electron.IpcRendererEvent, payload: ProviderLoginEventPayload) => {
            listener(payload.providerId);
        };

        ipcRenderer.on(DESKTOP_PROVIDER_LOGIN_OPENED_CHANNEL, wrapped);
        return () => {
            ipcRenderer.off(DESKTOP_PROVIDER_LOGIN_OPENED_CHANNEL, wrapped);
        };
    },
    onProviderLoginCompleted(listener: (providerId: string) => void) {
        const wrapped = (_event: Electron.IpcRendererEvent, payload: ProviderLoginEventPayload) => {
            listener(payload.providerId);
        };

        ipcRenderer.on(DESKTOP_PROVIDER_LOGIN_COMPLETED_CHANNEL, wrapped);
        return () => {
            ipcRenderer.off(DESKTOP_PROVIDER_LOGIN_COMPLETED_CHANNEL, wrapped);
        };
    },
    onProviderLoginWindowClosed(listener: (providerId: string) => void) {
        const wrapped = (_event: Electron.IpcRendererEvent, payload: ProviderLoginEventPayload) => {
            listener(payload.providerId);
        };

        ipcRenderer.on(DESKTOP_PROVIDER_LOGIN_CLOSED_CHANNEL, wrapped);
        return () => {
            ipcRenderer.off(DESKTOP_PROVIDER_LOGIN_CLOSED_CHANNEL, wrapped);
        };
    }
});
