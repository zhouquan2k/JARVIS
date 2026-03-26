/// <reference types="vite/client" />

import type { ProxyRequest, ProxyResponse } from '../shared/proxyProtocol';

declare module '*.vue' {
    import type { DefineComponent } from 'vue';

    const component: DefineComponent<Record<string, never>, Record<string, never>, any>;
    export default component;
}

declare global {
    interface Window {
        chatprismDesktop?: {
            sendProxyRequest(request: ProxyRequest): void;
            onProxyResponse(listener: (response: ProxyResponse) => void): () => void;
            openProviderLoginWindow(providerId: string): Promise<void>;
            onProviderLoginWindowOpened(listener: (providerId: string) => void): () => void;
            onProviderLoginWindowClosed(listener: (providerId: string) => void): () => void;
        };
    }
}

export {};
