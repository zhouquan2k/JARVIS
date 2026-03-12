import {
    ExternalHistoryError,
    resolveGeminiHistoryRuntimeConfig,
    type GeminiHistoryRemoteConfig,
    type GeminiHistoryRuntimeConfig,
    type ProviderRemoteConfigLoadResult
} from '@packages/core/src';

type AppEnv = Record<string, string | undefined>;

interface ConfigStorage {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
}

class ChromeStorageConfigStorage implements ConfigStorage {
    async get(key: string): Promise<string | null> {
        if (typeof chrome === 'undefined' || !chrome.storage?.local) {
            return null;
        }

        const result = await chrome.storage.local.get(key);
        const value = result[key];
        return typeof value === 'string' ? value : null;
    }

    async set(key: string, value: string): Promise<void> {
        if (typeof chrome === 'undefined' || !chrome.storage?.local) {
            return;
        }

        await chrome.storage.local.set({ [key]: value });
    }
}

const BUILTIN_GEMINI_HISTORY_CONFIG: GeminiHistoryRemoteConfig = {
    providerId: 'gemini-web',
    version: 'builtin-2026-03-11.1',
    matchOrigins: ['https://gemini.google.com'],
    selectors: {
        historyListContainer: 'conversations-list[data-test-id="all-conversations"], nav[aria-label="Chat history"], [data-test-id="conversation-list"]',
        historyListItem: 'a[data-test-id="conversation"], a[href*="/app/"]',
        historyTitle: '.conversation-title, [data-test-id="conversation-title"]',
        historyLink: 'a[data-test-id="conversation"], a[href*="/app/"]',
        conversationRoot: 'main, [data-test-id="conversation-root"]',
        userBubble: '[data-test-id="user-query"], user-query, [data-message-author="user"]',
        assistantBubble: '[data-test-id="model-response"], model-response, [data-message-author="assistant"]',
        lazyLoadSentinel: '[data-test-id="history-load-more"], [aria-label="Load more"]',
        loginGate: 'a[href*="ServiceLogin"], form[action*="ServiceLogin"]'
    },
    healthCheck: {
        requiredSelectors: ['historyListContainer', 'historyListItem', 'conversationRoot', 'userBubble', 'assistantBubble'],
        maxMissingCount: 2
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
        env?: AppEnv;
        storage?: ConfigStorage;
        fetchImpl?: typeof fetch;
        now?: () => number;
    } = {}) {
        this.runtimeConfig = resolveGeminiHistoryRuntimeConfig({ env: options.env });
        this.storage = options.storage ?? new ChromeStorageConfigStorage();
        this.fetchImpl = options.fetchImpl ?? fetch;
        this.now = options.now ?? (() => Date.now());
    }

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

            if (BUILTIN_GEMINI_HISTORY_CONFIG) {
                return {
                    config: BUILTIN_GEMINI_HISTORY_CONFIG,
                    metadata: {
                        providerId: 'gemini-history',
                        version: BUILTIN_GEMINI_HISTORY_CONFIG.version,
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
