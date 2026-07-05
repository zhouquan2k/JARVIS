import { contextBridge, ipcRenderer } from 'electron';
import {
    DESKTOP_CONTEXT_CHANNELS
} from '../shared/contextBridge';
import {
    DESKTOP_PROVIDER_LOGIN_COMPLETED_CHANNEL,
    DESKTOP_PROVIDER_LOGIN_CLOSED_CHANNEL,
    DESKTOP_PROVIDER_LOGIN_OPEN_CHANNEL,
    DESKTOP_PROVIDER_LOGIN_OPENED_CHANNEL,
    type ProviderLoginEventPayload
} from '../shared/authBridge';
import {
    DESKTOP_CONTROLLED_PAGE_DOM_EVENT_TO_RENDERER_CHANNEL,
    DESKTOP_CONTROLLED_PAGE_EVALUATE_CHANNEL,
    DESKTOP_CONTROLLED_PAGE_OPEN_CHANNEL,
    type ControlledPageDomEvent,
    type EvaluateInControlledPageRequest,
    type OpenControlledPageRequest
} from '../shared/controlledPageBridge';
import {
    DESKTOP_BROWSER_AUTOMATION_FETCH_CHANNEL,
    DESKTOP_BROWSER_AUTOMATION_GET_COOKIE_CHANNEL,
    type BrowserAutomationCookieRequest,
    type BrowserAutomationFetchRequest
} from '../shared/browserAutomationBridge';
import {
    DESKTOP_FETCH_CHANNEL,
    type DesktopFetchRequest,
    type DesktopFetchResponse
} from '../shared/fetchBridge';

function normalizeHeaders(headers?: HeadersInit): Array<[string, string]> | undefined {
    if (!headers) {
        return undefined;
    }

    if (Array.isArray(headers)) {
        return headers.map(([key, value]) => [key, value]);
    }

    if (headers instanceof Headers) {
        return Array.from(headers.entries());
    }

    return Object.entries(headers);
}

async function serializeFetchRequest(input: RequestInfo | URL, init?: RequestInit): Promise<DesktopFetchRequest> {
    if (input instanceof Request) {
        return {
            input: input.url,
            init: {
                method: init?.method ?? input.method,
                headers: normalizeHeaders(init?.headers ?? input.headers),
                bodyText: init?.body !== undefined ? String(init.body) : await input.text()
            }
        };
    }

    return {
        input: String(input),
        init: {
            method: init?.method,
            headers: normalizeHeaders(init?.headers),
            bodyText: init?.body === undefined ? undefined : String(init.body)
        }
    };
}

async function desktopFetch(input: RequestInfo | URL, init?: RequestInit): Promise<DesktopFetchResponse> {
    if (init?.signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
    }

    const payload = await serializeFetchRequest(input, init);
    return ipcRenderer.invoke(DESKTOP_FETCH_CHANNEL, payload) as Promise<DesktopFetchResponse>;
}

const jarvisContext = {
    initializeAccess() {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_CHANNELS.initializeAccess);
    },
    getContext() {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_CHANNELS.getContext);
    },
    getFolderMetadata(path: string) {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_CHANNELS.getFolderMetadata, path);
    },
    getProjectDocuments(curNode: string) {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_CHANNELS.getProjectDocuments, curNode);
    },
    readDocument(path: string) {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_CHANNELS.readDocument, path);
    },
    writeDocument(input: { path: string; mimeType: string; dataBase64: string; expectedVersion?: string }) {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_CHANNELS.writeDocument, input);
    },
    createNode(input: { parentPath?: string; name: string; kind: 'file' | 'directory' }) {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_CHANNELS.createNode, input);
    },
    deleteNode(path: string) {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_CHANNELS.deleteNode, path);
    },
    renameNode(input: { path: string; name: string }) {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_CHANNELS.renameNode, input);
    },
    moveNode(input: { path: string; targetParentPath?: string }) {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_CHANNELS.moveNode, input);
    },
    searchInScope(request: { query: string; scopePath?: string; maxResults?: number }) {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_CHANNELS.searchInScope, request);
    },
    getDocumentId(docPath: string) {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_CHANNELS.getDocumentId, docPath);
    },
    resolveDocumentIds(ids: string[]) {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_CHANNELS.resolveDocumentIds, ids);
    }
};

contextBridge.exposeInMainWorld('jarvisContext', jarvisContext);
contextBridge.exposeInMainWorld('jarvisFetchBridge', desktopFetch);

contextBridge.exposeInMainWorld('chatprismDesktop', {
    runtimeEnv: {
        contextBaseUrl: process.env.CHATPRISM_RENDERER_CONTEXT_BASE_URL ?? process.env.CHATPRISM_CONTEXT_BASE_URL,
        syncBaseUrl: process.env.CHATPRISM_RENDERER_SYNC_BASE_URL ?? process.env.CHATPRISM_SYNC_BASE_URL,
        syncKey: process.env.CHATPRISM_RENDERER_SYNC_KEY ?? process.env.CHATPRISM_SYNC_KEY ?? process.env.VITE_SYNC_KEY,
        codexBaseUrl: process.env.CHATPRISM_RENDERER_CODEX_BASE_URL ?? process.env.CHATPRISM_CODEX_BASE_URL,
        providerConfigBaseUrl: process.env.CHATPRISM_RENDERER_PROVIDER_CONFIG_BASE_URL ?? process.env.CHATPRISM_PROVIDER_CONFIG_BASE_URL,
        domChatGptUrl: process.env.CHATPRISM_DOM_CHATGPT_URL,
        domGeminiUrl: process.env.CHATPRISM_DOM_GEMINI_URL,
        geminiApiKey: process.env.CHATPRISM_LLM_API_KEY || process.env.VITE_LLM_API_KEY || process.env.VITE_GEMINI_API_KEY
    },
    initializeContextAccess() {
        return jarvisContext.initializeAccess();
    },
    getContext() {
        return jarvisContext.getContext();
    },
    getFolderMetadata(path: string) {
        return jarvisContext.getFolderMetadata(path);
    },
    getProjectDocuments(curNode: string) {
        return jarvisContext.getProjectDocuments(curNode);
    },
    readContextDocument(path: string) {
        return jarvisContext.readDocument(path);
    },
    writeContextDocument(input: { path: string; mimeType: string; dataBase64: string; expectedVersion?: string }) {
        return jarvisContext.writeDocument(input);
    },
    createContextNode(input: { parentPath?: string; name: string; kind: 'file' | 'directory' }) {
        return jarvisContext.createNode(input);
    },
    deleteContextNode(path: string) {
        return jarvisContext.deleteNode(path);
    },
    renameContextNode(input: { path: string; name: string }) {
        return jarvisContext.renameNode(input);
    },
    moveContextNode(input: { path: string; targetParentPath?: string }) {
        return jarvisContext.moveNode(input);
    },
    searchContextInScope(request: { query: string; scopePath?: string; maxResults?: number }) {
        return jarvisContext.searchInScope(request);
    },
    getDocumentId(docPath: string) {
        return jarvisContext.getDocumentId(docPath);
    },
    resolveDocumentIds(ids: string[]) {
        return jarvisContext.resolveDocumentIds(ids);
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
    fetch(input: RequestInfo | URL, init?: RequestInit) {
        return desktopFetch(input, init);
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
    },
    subscribeControlledPageEvent(listener: (event: ControlledPageDomEvent) => void) {
        const wrapped = (_event: Electron.IpcRendererEvent, payload: ControlledPageDomEvent) => {
            listener(payload);
        };

        ipcRenderer.on(DESKTOP_CONTROLLED_PAGE_DOM_EVENT_TO_RENDERER_CHANNEL, wrapped);
        return () => {
            ipcRenderer.off(DESKTOP_CONTROLLED_PAGE_DOM_EVENT_TO_RENDERER_CHANNEL, wrapped);
        };
    }
});
