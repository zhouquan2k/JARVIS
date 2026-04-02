/// <reference types="chrome"/>
import {
    ExternalHistoryError,
    type Conversation,
    type ConversationHistorySummary,
    type HistoryListQueryOptions,
    type IHistoryProvider
} from '@packages/core/src';
import type { GetHistoryDetailRequest, GetHistoryListRequest, ProxyRequest, ProxyResponse } from './proxyProtocol';

type PendingRequest = {
    message: ProxyRequest;
    retried: boolean;
    resolve: (value: any) => void;
    reject: (reason: Error) => void;
};

export class BackgroundHistoryProxy implements IHistoryProvider {
    public id: string;
    private port: chrome.runtime.Port | null = null;
    private readonly channelId: string;
    private readonly pending = new Map<string, PendingRequest>();

    constructor(providerId: string, options?: { channelId?: string }) {
        this.id = providerId;
        this.channelId = options?.channelId || `history-proxy-${crypto.randomUUID()}`;
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
        const requestsToRetry = Array.from(this.pending.entries())
            .filter(([, request]) => !request.retried);

        if (requestsToRetry.length === 0) {
            const error = new Error('Background history proxy connection disconnected');
            this.pending.forEach((request) => request.reject(error));
            this.pending.clear();
            return;
        }

        const port = this.ensureConnection();
        for (const [requestId, request] of requestsToRetry) {
            request.retried = true;

            try {
                port.postMessage(request.message);
            } catch {
                this.pending.delete(requestId);
                request.reject(new Error('Background history proxy connection disconnected'));
            }
        }
    };

    private handleMessage = (msg: ProxyResponse) => {
        if (!msg || msg.channelId !== this.channelId || msg.type !== 'DONE' && msg.type !== 'ERROR') {
            return;
        }

        const request = this.pending.get(msg.requestId);
        if (!request) {
            return;
        }

        this.pending.delete(msg.requestId);

        if (msg.type === 'DONE') {
            request.resolve(msg.result);
            return;
        }

        if (msg.historyErrorCode) {
            request.reject(new ExternalHistoryError(msg.historyErrorCode, msg.error, {
                providerId: msg.historyProviderId
            }));
            return;
        }

        request.reject(new Error(msg.error));
    };

    private nextRequestId(action: string): string {
        return `${action.toLowerCase()}-${crypto.randomUUID()}`;
    }

    private createTrackedRequest<T>(message: ProxyRequest): Promise<T> {
        return new Promise((resolve, reject) => {
            const port = this.ensureConnection();
            this.pending.set(message.requestId, {
                message,
                retried: false,
                resolve,
                reject
            });

            try {
                port.postMessage(message);
            } catch (error) {
                this.pending.delete(message.requestId);
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        });
    }

    getHistoryList(options: HistoryListQueryOptions = {}): Promise<ConversationHistorySummary[]> {
        const request: GetHistoryListRequest = {
            action: 'GET_HISTORY_LIST',
            requestId: this.nextRequestId('GET_HISTORY_LIST'),
            channelId: this.channelId,
            providerId: this.id,
            query: options.query
        };

        return this.createTrackedRequest<ConversationHistorySummary[]>(request);
    }

    getHistoryDetail(externalId: string): Promise<Conversation> {
        const request: GetHistoryDetailRequest = {
            action: 'GET_HISTORY_DETAIL',
            requestId: this.nextRequestId('GET_HISTORY_DETAIL'),
            channelId: this.channelId,
            providerId: this.id,
            externalId
        };

        return this.createTrackedRequest<Conversation>(request);
    }
}
