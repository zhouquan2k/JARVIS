/// <reference types="vite/client" />

import type {
    Conversation,
    ConversationQuery,
    ContextDocument,
    ContextNode,
    ContextSearchMatch,
    ContextSearchRequest,
    CreateContextNodeInput,
    WorkspaceContext,
    WriteContextDocumentInput,
    WriteContextDocumentResult
} from '@packages/core/src';
import type { ProxyRequest, ProxyResponse } from '../shared/proxyProtocol';

declare module '*.vue' {
    import type { DefineComponent } from 'vue';

    const component: DefineComponent<Record<string, never>, Record<string, never>, any>;
    export default component;
}

declare global {
    interface Window {
        chatprismDesktop?: {
            initializeContextAccess(): Promise<void>;
            getContext(): Promise<WorkspaceContext>;
            getConversations(query: ConversationQuery): Promise<Conversation[]>;
            readContextDocument(path: string): Promise<ContextDocument>;
            writeContextDocument(input: WriteContextDocumentInput): Promise<WriteContextDocumentResult>;
            createContextNode(input: CreateContextNodeInput): Promise<ContextNode>;
            deleteContextNode(path: string): Promise<void>;
            renameContextNode(input: { path: string; name: string }): Promise<ContextNode>;
            searchContextInScope(request: ContextSearchRequest): Promise<ContextSearchMatch[]>;
            sendProxyRequest(request: ProxyRequest): void;
            onProxyResponse(listener: (response: ProxyResponse) => void): () => void;
            openProviderLoginWindow(providerId: string): Promise<void>;
            onProviderLoginWindowOpened(listener: (providerId: string) => void): () => void;
            onProviderLoginCompleted(listener: (providerId: string) => void): () => void;
            onProviderLoginWindowClosed(listener: (providerId: string) => void): () => void;
        };
    }
}

export {};
