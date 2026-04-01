/// <reference types="vite/client" />

import type {
    ContextDocument,
    ContextNode,
    ContextSearchMatch,
    ContextSearchRequest,
    CreateContextNodeInput,
    ResolvedAgentConfig
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
            listContextTree(parentPath?: string): Promise<ContextNode[]>;
            readContextDocument(path: string): Promise<ContextDocument>;
            writeContextDocument(path: string, content: string): Promise<void>;
            createContextNode(input: CreateContextNodeInput): Promise<ContextNode>;
            searchContextInScope(request: ContextSearchRequest): Promise<ContextSearchMatch[]>;
            resolveScopedAgentConfig(targetPath: string): Promise<ResolvedAgentConfig>;
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
