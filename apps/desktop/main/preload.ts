import { contextBridge, ipcRenderer } from 'electron';
import {
    DESKTOP_CONTEXT_CREATE_NODE_CHANNEL,
    DESKTOP_CONTEXT_INITIALIZE_CHANNEL,
    DESKTOP_CONTEXT_LIST_TREE_CHANNEL,
    DESKTOP_CONTEXT_READ_DOCUMENT_CHANNEL,
    DESKTOP_CONTEXT_WRITE_DOCUMENT_CHANNEL
} from '../shared/contextBridge';
import {
    DESKTOP_PROVIDER_LOGIN_CLOSED_CHANNEL,
    DESKTOP_PROVIDER_LOGIN_OPEN_CHANNEL,
    DESKTOP_PROVIDER_LOGIN_OPENED_CHANNEL,
    type ProviderLoginWindowClosedPayload
} from '../shared/authBridge';
import {
    DESKTOP_PROXY_REQUEST_CHANNEL,
    DESKTOP_PROXY_RESPONSE_CHANNEL,
    type ProxyRequest,
    type ProxyResponse
} from '../shared/proxyProtocol';

contextBridge.exposeInMainWorld('chatprismDesktop', {
    initializeContextAccess() {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_INITIALIZE_CHANNEL);
    },
    listContextTree(parentPath?: string) {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_LIST_TREE_CHANNEL, parentPath);
    },
    readContextDocument(path: string) {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_READ_DOCUMENT_CHANNEL, path);
    },
    writeContextDocument(path: string, content: string) {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_WRITE_DOCUMENT_CHANNEL, path, content);
    },
    createContextNode(input: { parentPath?: string; name: string; kind: 'file' | 'directory' }) {
        return ipcRenderer.invoke(DESKTOP_CONTEXT_CREATE_NODE_CHANNEL, input);
    },
    sendProxyRequest(request: ProxyRequest) {
        ipcRenderer.send(DESKTOP_PROXY_REQUEST_CHANNEL, request);
    },
    onProxyResponse(listener: (response: ProxyResponse) => void) {
        const wrapped = (_event: Electron.IpcRendererEvent, response: ProxyResponse) => {
            listener(response);
        };

        ipcRenderer.on(DESKTOP_PROXY_RESPONSE_CHANNEL, wrapped);
        return () => {
            ipcRenderer.off(DESKTOP_PROXY_RESPONSE_CHANNEL, wrapped);
        };
    },
    openProviderLoginWindow(providerId: string) {
        return ipcRenderer.invoke(DESKTOP_PROVIDER_LOGIN_OPEN_CHANNEL, providerId);
    },
    onProviderLoginWindowOpened(listener: (providerId: string) => void) {
        const wrapped = (_event: Electron.IpcRendererEvent, payload: ProviderLoginWindowClosedPayload) => {
            listener(payload.providerId);
        };

        ipcRenderer.on(DESKTOP_PROVIDER_LOGIN_OPENED_CHANNEL, wrapped);
        return () => {
            ipcRenderer.off(DESKTOP_PROVIDER_LOGIN_OPENED_CHANNEL, wrapped);
        };
    },
    onProviderLoginWindowClosed(listener: (providerId: string) => void) {
        const wrapped = (_event: Electron.IpcRendererEvent, payload: ProviderLoginWindowClosedPayload) => {
            listener(payload.providerId);
        };

        ipcRenderer.on(DESKTOP_PROVIDER_LOGIN_CLOSED_CHANNEL, wrapped);
        return () => {
            ipcRenderer.off(DESKTOP_PROVIDER_LOGIN_CLOSED_CHANNEL, wrapped);
        };
    }
});
