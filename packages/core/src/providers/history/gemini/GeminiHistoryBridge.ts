import type { HistoryListQueryOptions } from '../../../interfaces/IHistoryProvider';
import type { GeminiHistoryRemoteConfig } from '../../../interfaces/ProviderRemoteConfig';
import type {
    GeminiContentConversationDetail,
    GeminiContentHistorySummary
} from './geminiContentProtocol';

export interface GeminiHistoryBridge {
    getHistoryList(
        config: GeminiHistoryRemoteConfig,
        options?: HistoryListQueryOptions
    ): Promise<GeminiContentHistorySummary[]>;
    getHistoryDetail(config: GeminiHistoryRemoteConfig, externalId: string): Promise<GeminiContentConversationDetail>;
}
