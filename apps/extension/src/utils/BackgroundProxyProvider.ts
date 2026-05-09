/// <reference types="chrome"/>
import {
    IModelProvider,
    type AnalysisResult,
    type GenerateConversationTitleOptions,
    type ProviderDocumentCapability,
    type ProviderSendResult,
    type ProviderStreamUpdate
} from '@packages/core/src';
import type { ProviderModelCatalog } from '@packages/core/config';
import type {
    AnalyzeComparisonRequest,
    CheckAuthRequest,
    GetAvailableModelsRequest,
    GenerateConversationTitleRequest,
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

export class BackgroundProxyProvider implements IModelProvider {
    public id: string;
    private port: chrome.runtime.Port | null = null;
    private readonly channelId: string;
    private readonly pending = new Map<string, PendingRequest>();

    constructor(providerId: string, options?: { channelId?: string }) {
        this.id = providerId;
        this.channelId = options?.channelId || `proxy-${crypto.randomUUID()}`;
    }

    private ensureConnection() {
        if (!this.port) {
            this.port = chrome.runtime.connect({ name: 'ai-provider-proxy' });
            this.port.onDisconnect.addListener(this.handleDisconnect);
            this.port.onMessage.addListener(this.handleMessage);
        }
        return this.port;
    }

    private handleDisconnect = () => {
        this.port = null;
        const error = new Error('Background proxy connection disconnected');
        this.pending.forEach((request) => {
            request.reject(error);
        });
        this.pending.clear();
    };

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

        if (msg.type === 'AUTH_RESULT') {
            this.pending.delete(msg.requestId);
            request.resolve(msg.isAuth);
            return;
        }

        if (msg.type === 'DONE') {
            this.pending.delete(msg.requestId);
            request.resolve(msg.result);
            return;
        }

        if (msg.type === 'ERROR') {
            this.pending.delete(msg.requestId);
            request.reject(new Error(msg.error));
        }
    };

    private nextRequestId(action: string): string {
        return `${action.toLowerCase()}-${crypto.randomUUID()}`;
    }

    private createTrackedRequest<T>(
        message: ProxyRequest,
        onUpdate?: (update: ProviderStreamUpdate | string) => void
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const port = this.ensureConnection();
            this.pending.set(message.requestId, { onUpdate, resolve, reject });
            port.postMessage(message);
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

    generateConversationTitle(
        prompt: string,
        options: GenerateConversationTitleOptions = {}
    ): Promise<string> {
        const request: GenerateConversationTitleRequest = {
            action: 'GENERATE_CONVERSATION_TITLE',
            requestId: this.nextRequestId('GENERATE_CONVERSATION_TITLE'),
            channelId: this.channelId,
            providerId: this.id,
            prompt,
            options
        };

        return this.createTrackedRequest<string>(request);
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

        return this.createTrackedRequest<ProviderSendResult>(
            request,
            onUpdate
        );
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

        return this.createTrackedRequest<AnalysisResult>(request, onUpdate);
    }

    abort(): void {
        if (!this.port) {
            return;
        }

        const requestIds = Array.from(this.pending.keys());
        for (const requestId of requestIds) {
            this.port.postMessage({
                action: 'ABORT',
                requestId: this.nextRequestId('ABORT'),
                channelId: this.channelId,
                targetRequestId: requestId
            });
        }
    }
}
