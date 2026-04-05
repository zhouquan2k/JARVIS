import type { ExternalHistoryProviderId } from './IExternalConversationProvider';

export type ProviderRemoteConfigId = 'gemini-history';
export type ProviderRemoteConfigSource = 'remote' | 'cache' | 'builtin';

export interface ProviderRemoteConfigMetadata {
    providerId: ProviderRemoteConfigId;
    version: string;
    fetchedAt: number;
    source: ProviderRemoteConfigSource;
    cacheControl?: string;
}

export interface GeminiHistorySelectors {
    historyListContainer: string;
    historyListItem: string;
    historyTitle: string;
    historyLink: string;
    historySearchInput?: string;
    historySearchSubmit?: string;
    historySearchClear?: string;
    historySearchResultContainer?: string;
    historySearchResultItem?: string;
    historySearchEmptyState?: string;
    conversationRoot: string;
    userBubble: string;
    assistantBubble: string;
    lazyLoadSentinel?: string;
    loginGate?: string;
}

export interface GeminiHistoryHealthCheck {
    requiredSelectors: Array<keyof GeminiHistorySelectors>;
    maxMissingCount: number;
}

export interface GeminiHistoryRemoteConfig {
    providerId: ExternalHistoryProviderId;
    version: string;
    matchOrigins: string[];
    selectors: GeminiHistorySelectors;
    healthCheck: GeminiHistoryHealthCheck;
}

export interface ProviderRemoteConfigLoadResult<TConfig> {
    config: TConfig;
    metadata: ProviderRemoteConfigMetadata;
}
