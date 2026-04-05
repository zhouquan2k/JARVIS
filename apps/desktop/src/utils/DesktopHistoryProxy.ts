import {
    ExternalHistoryError,
    type Conversation,
    type ConversationHistorySummary,
    type HistoryListQueryOptions,
    type IExternalConversationProvider
} from '@packages/core/src';
import type { GetHistoryDetailRequest, GetHistoryListRequest, ProxyRequest, ProxyResponse } from './proxyProtocol';

type PendingRequest = {
    resolve: (value: any) => void;
    reject: (reason: Error) => void;
};

export class DesktopHistoryProxy implements IExternalConversationProvider {
    public id: 'chatgpt-web' | 'gemini-web';
    private unsubscribe: (() => void) | null = null;
    private readonly channelId: string;
    private readonly pending = new Map<string, PendingRequest>();

    constructor(providerId: 'chatgpt-web' | 'gemini-web', options?: { channelId?: string }) {
        this.id = providerId;
        this.channelId = options?.channelId || `desktop-history-proxy-${crypto.randomUUID()}`;
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
        if (!msg || msg.channelId !== this.channelId || (msg.type !== 'DONE' && msg.type !== 'ERROR')) {
            return;
        }

        const request = this.pending.get(msg.requestId);
        if (!request) {
            return;
        }

        this.pending.delete(msg.requestId);
        if (this.pending.size === 0) {
            this.unsubscribe?.();
            this.unsubscribe = null;
        }

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
            const bridge = this.getBridge();
            this.pending.set(message.requestId, {
                resolve,
                reject
            });
            bridge.sendProxyRequest(message);
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
