import type { Conversation } from './IStorageProvider';

export type ConversationSourceType = 'local' | 'chatgpt_web';

export interface ConversationHistorySummary {
    id: string;
    title: string;
    updatedAt: number;
    sourceType: ConversationSourceType;
    isImported?: boolean;
}

export interface IHistoryProvider {
    id: string;
    getHistoryList(): Promise<ConversationHistorySummary[]>;
    getHistoryDetail(externalId: string): Promise<Conversation>;
}
