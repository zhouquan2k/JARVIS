import {
    resolveGeminiHistoryRuntimeConfig,
    type GeminiHistoryRuntimeConfig
} from '../../../../config';
import { ExternalHistoryError } from '../../../interfaces/IExternalConversationProvider';
import type {
    GeminiHistoryRemoteConfig,
    ProviderRemoteConfigLoadResult
} from '../../../interfaces/ProviderRemoteConfig';

type AppEnv = Record<string, string | undefined>;

export interface ConfigStorage {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
}

const BUILTIN_GEMINI_HISTORY_CONFIG: GeminiHistoryRemoteConfig = {
    providerId: 'gemini-web',
    version: 'builtin-2026-04-01.3',
    matchOrigins: ['https://gemini.google.com'],
    selectors: {
        historyListContainer: 'conversations-list[data-test-id="all-conversations"], nav[aria-label="Chat history"], [data-test-id="conversation-list"]',
        historyListItem: 'a[data-test-id="conversation"], a[href*="/app/"]',
        historyTitle: '.conversation-title, [data-test-id="conversation-title"]',
        historyLink: 'a[data-test-id="conversation"], a[href*="/app/"]',
        historySearchInput: 'input[type="search"], input[aria-label*="Search" i], input[placeholder*="Search" i], input[aria-label*="搜索" i], input[placeholder*="搜索" i], textarea[aria-label*="Search" i], textarea[placeholder*="Search" i], [role="searchbox"], [contenteditable="true"][aria-label*="Search" i], [contenteditable="true"][aria-label*="搜索" i]',
        historySearchResultContainer: 'search-window',
        historySearchResultItem: '[data-test-id="conversation"], [data-test-id="search-result"], [ng-reflect-router-link*="/app/"], [routerlink*="/app/"], [href*="/app/"]',
        historySearchEmptyState: 'search-window [data-test-id="empty-state"], search-window [data-test-id="no-results"], search-window [role="status"], search-window [aria-live="polite"]',
        conversationRoot: 'main, [data-test-id="conversation-root"]',
        userBubble: '[data-test-id="user-query"], user-query, [data-message-author="user"]',
        assistantBubble: '[data-test-id="model-response"], model-response, [data-message-author="assistant"]',
        lazyLoadSentinel: '[data-test-id="history-load-more"], [aria-label="Load more"]',
        loginGate: 'a[href*="ServiceLogin"], form[action*="ServiceLogin"]'
    },
    healthCheck: {
        requiredSelectors: ['historyListContainer', 'historyListItem', 'conversationRoot', 'userBubble', 'assistantBubble'],
        maxMissingCount: 1
    }
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidGeminiHistoryConfig(value: unknown): value is GeminiHistoryRemoteConfig {
    if (!isRecord(value)) {
        return false;
    }

    return value.providerId === 'gemini-web'
        && typeof value.version === 'string'
        && Array.isArray(value.matchOrigins)
        && isRecord(value.selectors)
        && isRecord(value.healthCheck);
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs: number, fetchImpl: typeof fetch): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetchImpl(url, {
            method: 'GET',
            signal: controller.signal
        });
    } finally {
        clearTimeout(timer);
    }
}

export class GeminiHistoryConfigLoader {
    private readonly runtimeConfig: GeminiHistoryRuntimeConfig;
    private readonly storage: ConfigStorage;
    private readonly fetchImpl: typeof fetch;
    private readonly now: () => number;

    constructor(options: {
        storage: ConfigStorage;
        env?: AppEnv;
        fetchImpl?: typeof fetch;
        now?: () => number;
        builtinConfig?: GeminiHistoryRemoteConfig;
    }) {
        this.runtimeConfig = resolveGeminiHistoryRuntimeConfig({ env: options.env });
        this.storage = options.storage;
        this.fetchImpl = options.fetchImpl ?? fetch;
        this.now = options.now ?? (() => Date.now());
        this.builtinConfig = options.builtinConfig ?? BUILTIN_GEMINI_HISTORY_CONFIG;
    }

    private readonly builtinConfig: GeminiHistoryRemoteConfig;

    async load(): Promise<ProviderRemoteConfigLoadResult<GeminiHistoryRemoteConfig>> {
        try {
            const response = await fetchJsonWithTimeout(
                this.runtimeConfig.providerConfigPath,
                this.runtimeConfig.requestTimeoutMs,
                this.fetchImpl
            );
            if (!response.ok) {
                throw new Error(`Provider config request failed with status ${response.status}`);
            }

            const payload = await response.json() as unknown;
            if (!isValidGeminiHistoryConfig(payload)) {
                throw new Error('Remote Gemini config payload is invalid');
            }

            return {
                config: payload,
                metadata: {
                    providerId: 'gemini-history',
                    version: payload.version,
                    fetchedAt: this.now(),
                    source: 'remote',
                    cacheControl: response.headers.get('cache-control') ?? undefined
                }
            };
        } catch (error) {
            const cached = await this.readCachedConfig();
            if (cached) {
                return cached;
            }

            if (this.builtinConfig) {
                return {
                    config: this.builtinConfig,
                    metadata: {
                        providerId: 'gemini-history',
                        version: this.builtinConfig.version,
                        fetchedAt: this.now(),
                        source: 'builtin'
                    }
                };
            }

            throw new ExternalHistoryError('CONFIG_UNAVAILABLE', 'Gemini 抓取配置不可用。', {
                providerId: 'gemini-web',
                cause: error
            });
        }
    }

    async markValidated(config: GeminiHistoryRemoteConfig): Promise<void> {
        if (!isValidGeminiHistoryConfig(config)) {
            return;
        }

        await this.storage.set(this.runtimeConfig.storageKey, JSON.stringify(config));
    }

    private async readCachedConfig(): Promise<ProviderRemoteConfigLoadResult<GeminiHistoryRemoteConfig> | null> {
        const raw = await this.storage.get(this.runtimeConfig.storageKey);
        if (!raw) {
            return null;
        }

        try {
            const parsed = JSON.parse(raw) as unknown;
            if (!isValidGeminiHistoryConfig(parsed)) {
                return null;
            }

            return {
                config: parsed,
                metadata: {
                    providerId: 'gemini-history',
                    version: parsed.version,
                    fetchedAt: this.now(),
                    source: 'cache'
                }
            };
        } catch {
            return null;
        }
    }
}
