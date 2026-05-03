import type {
    ISyncTransport,
    SyncDeletedConversation,
    SyncPullResult,
    SyncPushResult
} from '../../interfaces/ISyncTransport';
import type { Conversation } from '../../interfaces/Conversation';
import { HttpApiClient } from '../http/HttpApiClient';

export interface FetchSyncTransportOptions {
    syncKey: string;
    baseUrl?: string;
    fetchImpl?: typeof fetch;
    headers?: Record<string, string>;
}

export class FetchSyncTransport implements ISyncTransport {
    private readonly client: HttpApiClient;

    constructor(options: FetchSyncTransportOptions) {
        this.client = new HttpApiClient({
            baseUrl: (options.baseUrl || '/api/sync').replace(/\/$/, ''),
            fetchImpl: options.fetchImpl,
            source: 'sync',
            headers: {
                'x-sync-key': options.syncKey,
                ...(options.headers ?? {})
            }
        });
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
        return this.client.postJson<T>(path, body);
    }
}
