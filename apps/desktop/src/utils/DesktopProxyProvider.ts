import {
    IModelProvider,
    type AnalysisResult,
    type ProviderDocumentCapability,
    type ProviderSendResult,
    type ProviderStreamUpdate
} from '@packages/core/src';
import type { ProviderModelCatalog } from '@packages/core/config';
import type {
    AnalyzeComparisonRequest,
    CheckAuthRequest,
    GetAvailableModelsRequest,
    ProviderSendOptions,
    ProxyRequest,
    ProxyResponse,
    SendMessageRequest
} from './proxyProtocol';

type PendingRequest = {
    onUpdate?: (update: ProviderStreamUpdate | string) => void;
    resolve: (value: any) => void;
    reject: (reason: Error) => void;
};

export class DesktopProxyProvider implements IModelProvider {
    public id: string;
    private unsubscribe: (() => void) | null = null;
    private readonly channelId: string;
    private readonly pending = new Map<string, PendingRequest>();

    constructor(providerId: string, options?: { channelId?: string }) {
        this.id = providerId;
        this.channelId = options?.channelId || `desktop-proxy-${crypto.randomUUID()}`;
    }

    private getBridge() {
        const bridge = window.chatprismDesktop;
        if (!bridge) {
            throw new Error('Desktop host bridge unavailable');
        }

        if (!this.unsubscribe) {
            this.unsubscribe = bridge.onProxyResponse(this.handleMessage);
        }

        return bridge;
    }

    private handleMessage = (msg: ProxyResponse) => {
        if (!msg || msg.channelId !== this.channelId) {
            return;
        }

        const request = this.pending.get(msg.requestId);
        if (!request) {
            return;
        }

        if (msg.type === 'UPDATE') {
            request.onUpdate?.(msg.chunk);
            return;
        }

        this.pending.delete(msg.requestId);
        if (this.pending.size === 0) {
            this.unsubscribe?.();
            this.unsubscribe = null;
        }

        if (msg.type === 'AUTH_RESULT') {
            request.resolve(msg.isAuth);
            return;
        }

        if (msg.type === 'DONE') {
            request.resolve(msg.result);
            return;
        }

        request.reject(new Error(msg.error));
    };

    private nextRequestId(action: string): string {
        return `${action.toLowerCase()}-${crypto.randomUUID()}`;
    }

    private createTrackedRequest<T>(
        message: ProxyRequest,
        onUpdate?: (update: ProviderStreamUpdate | string) => void
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const bridge = this.getBridge();
            this.pending.set(message.requestId, { onUpdate, resolve, reject });
            bridge.sendProxyRequest(message);
        });
    }

    checkAuth(): Promise<boolean> {
        const request: CheckAuthRequest = {
            action: 'CHECK_AUTH',
            requestId: this.nextRequestId('CHECK_AUTH'),
            channelId: this.channelId,
            providerId: this.id
        };

        return this.createTrackedRequest<boolean>(request);
    }

    getAvailableModels(): Promise<ProviderModelCatalog> {
        const request: GetAvailableModelsRequest = {
            action: 'GET_AVAILABLE_MODELS',
            requestId: this.nextRequestId('GET_AVAILABLE_MODELS'),
            channelId: this.channelId,
            providerId: this.id
        };

        return this.createTrackedRequest<ProviderModelCatalog>(request);
    }

    getDocumentCapability(): Promise<ProviderDocumentCapability> {
        return this.createTrackedRequest<ProviderDocumentCapability>({
            action: 'GET_DOCUMENT_CAPABILITY',
            requestId: this.nextRequestId('GET_DOCUMENT_CAPABILITY'),
            channelId: this.channelId,
            providerId: this.id
        });
    }

    sendMessage(
        prompt: string,
        options: ProviderSendOptions = {},
        onUpdate: (update: ProviderStreamUpdate) => void
    ): Promise<ProviderSendResult> {
        const request: SendMessageRequest = {
            action: 'SEND_MESSAGE',
            requestId: this.nextRequestId('SEND_MESSAGE'),
            channelId: this.channelId,
            providerId: this.id,
            prompt,
            options
        };

        return this.createTrackedRequest<ProviderSendResult>(request, (update) => {
            if (typeof update !== 'string') {
                onUpdate(update);
            }
        });
    }

    analyzeComparison(
        payload: {
            prompt: string;
            outputA: string;
            outputB: string;
            analyzerProviderId?: string;
            analyzerModelId?: string;
        },
        onUpdate: (chunk: string) => void
    ): Promise<AnalysisResult> {
        const request: AnalyzeComparisonRequest = {
            action: 'ANALYZE_COMPARISON',
            requestId: this.nextRequestId('ANALYZE_COMPARISON'),
            channelId: this.channelId,
            prompt: payload.prompt,
            outputA: payload.outputA,
            outputB: payload.outputB,
            analyzerProviderId: payload.analyzerProviderId || this.id,
            analyzerModelId: payload.analyzerModelId
        };

        return this.createTrackedRequest<AnalysisResult>(request, (update) => {
            if (typeof update === 'string') {
                onUpdate(update);
            }
        });
    }

    abort(): void {
        if (this.pending.size === 0) {
            return;
        }

        const bridge = this.getBridge();
        for (const requestId of Array.from(this.pending.keys())) {
            bridge.sendProxyRequest({
                action: 'ABORT',
                requestId: this.nextRequestId('ABORT'),
                channelId: this.channelId,
                targetRequestId: requestId
            });
        }
    }
}
