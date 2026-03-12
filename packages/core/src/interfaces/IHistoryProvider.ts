import type { Conversation } from './IStorageProvider';

export type ExternalHistoryProviderId = 'chatgpt-web' | 'gemini-web' | 'external-file';
export type ConversationOrigin = 'local' | ExternalHistoryProviderId;

export type ExternalHistoryProviderKind = 'history-provider' | 'file-import';

export interface ExternalHistoryProviderEntry {
    id: ExternalHistoryProviderId;
    label: string;
    kind: ExternalHistoryProviderKind;
    provider?: IHistoryProvider;
}

export type ExternalHistoryErrorCode =
    | 'AUTH_REQUIRED'
    | 'CONFIG_UNAVAILABLE'
    | 'SELECTOR_MISMATCH'
    | 'DETAIL_NOT_FOUND'
    | 'TAB_UNAVAILABLE'
    | 'UNKNOWN';

export interface ExternalHistoryErrorOptions {
    providerId?: ExternalHistoryProviderId;
    recoverable?: boolean;
    fromCache?: boolean;
    cause?: unknown;
}

export class ExternalHistoryError extends Error {
    public readonly code: ExternalHistoryErrorCode;
    public readonly providerId?: ExternalHistoryProviderId;
    public readonly recoverable: boolean;
    public readonly fromCache: boolean;
    public readonly cause?: unknown;

    constructor(code: ExternalHistoryErrorCode, message: string, options: ExternalHistoryErrorOptions = {}) {
        super(message);
        this.name = 'ExternalHistoryError';
        this.code = code;
        this.providerId = options.providerId;
        this.recoverable = options.recoverable ?? true;
        this.fromCache = options.fromCache ?? false;
        this.cause = options.cause;
    }
}

export interface ConversationHistorySummary {
    id: string;
    title: string;
    updatedAt: number;
    origin: ExternalHistoryProviderId;
    isImported?: boolean;
}

export interface IHistoryProvider {
    id: ExternalHistoryProviderId;
    getHistoryList(): Promise<ConversationHistorySummary[]>;
    getHistoryDetail(externalId: string): Promise<Conversation>;
}
