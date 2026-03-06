/// <reference types="chrome"/>
import { IModelProvider, type AnalysisResult } from '@packages/core/src';
import type {
    AnalyzeComparisonRequest,
    CheckAuthRequest,
    ProviderSendOptions,
    ProxyRequest,
    ProxyResponse,
    SendMessageRequest
} from './proxyProtocol';

type PendingRequest = {
    onUpdate?: (chunk: string) => void;
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
        onUpdate?: (chunk: string) => void
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

    sendMessage(
        prompt: string,
        options: ProviderSendOptions = {},
        onUpdate: (chunk: string) => void
    ): Promise<{ text: string, conversationId: string, messageId: string }> {
        const request: SendMessageRequest = {
            action: 'SEND_MESSAGE',
            requestId: this.nextRequestId('SEND_MESSAGE'),
            channelId: this.channelId,
            providerId: this.id,
            prompt,
            options
        };

        return this.createTrackedRequest<{ text: string, conversationId: string, messageId: string }>(
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
