import type {
    ISyncTransport,
    SyncDeletedConversation,
    SyncPullResult,
    SyncPushResult
} from '../../interfaces/ISyncTransport';
import type { Conversation } from '../../interfaces/Conversation';

export interface FetchSyncTransportOptions {
    syncKey: string;
    baseUrl?: string;
    fetchImpl?: typeof fetch;
    headers?: Record<string, string>;
}

export class FetchSyncTransport implements ISyncTransport {
    private readonly syncKey: string;
    private readonly baseUrl: string;
    private readonly fetchImpl: typeof fetch;
    private readonly headers: Record<string, string>;

    constructor(options: FetchSyncTransportOptions) {
        this.syncKey = options.syncKey;
        this.baseUrl = (options.baseUrl || '/api/sync').replace(/\/$/, '');
        this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
        this.headers = options.headers ?? {};
    }

    async pull(cursor: number | null): Promise<SyncPullResult> {
        return this.post<SyncPullResult>('/pull', { cursor });
    }

    async push(
        conversations: Conversation[],
        deletedConversations: SyncDeletedConversation[] = []
    ): Promise<SyncPushResult> {
        return this.post<SyncPushResult>('/push', { conversations, deletedConversations });
    }

    private async post<T>(path: string, body: unknown): Promise<T> {
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-sync-key': this.syncKey,
                ...this.headers
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`Sync request failed with status ${response.status}`);
        }

        return response.json() as Promise<T>;
    }
}
