export type RuntimeMode = 'extension' | 'web';

export interface ModelConfig {
    id: string;
    name: string;
}

export interface ProviderModelCatalog {
    models: ModelConfig[];
    defaultModel: string;
}

export interface ProviderConfig {
    id: string;
    name: string;
    models: ModelConfig[];
    defaultModel: string;
    preferredDefaultModel?: string;
    supportedRuntimeModes: RuntimeMode[];
    enabled?: boolean;
}

export interface AnalyzerConfig {
    defaultProvider: string;
    defaultModel: string;
    systemPrompt: string;
}

export const DEFAULT_SYNC_KEY = '0';
export const SYNC_KEY_STORAGE_KEY = 'chatprism:sync-key';
export const DEFAULT_SYNC_BASE_URL = 'http://127.0.0.1:8787/api/sync';
export const DEFAULT_PROVIDER_CONFIG_BASE_URL = 'http://127.0.0.1:8787/api/provider-configs';
export const DEFAULT_GEMINI_HISTORY_PAGE_ORIGIN = 'https://gemini.google.com';
export const DEFAULT_GEMINI_HISTORY_PAGE_URL = `${DEFAULT_GEMINI_HISTORY_PAGE_ORIGIN}/app`;
export const DEFAULT_GEMINI_HISTORY_CONFIG_STORAGE_KEY = 'chatprism:provider-config:gemini-history';
export const DEFAULT_GEMINI_HISTORY_REQUEST_TIMEOUT_MS = 10_000;

export interface SyncKeyOptions {
    storage?: Pick<Storage, 'getItem'>;
    env?: Record<string, string | undefined>;
    isDevelopment?: boolean;
}

export interface SyncBaseUrlOptions {
    env?: Record<string, string | undefined>;
}

export interface ProviderConfigBaseUrlOptions {
    env?: Record<string, string | undefined>;
}

export interface GeminiHistoryRuntimeConfigOptions {
    env?: Record<string, string | undefined>;
}

export interface GeminiHistoryRuntimeConfig {
    providerConfigBaseUrl: string;
    providerConfigPath: string;
    pageOrigin: string;
    pageUrl: string;
    storageKey: string;
    requestTimeoutMs: number;
}

const SYNC_KEY_ENV_KEYS = ['CHATPRISM_SYNC_KEY', 'VITE_SYNC_KEY', 'WXT_SYNC_KEY'] as const;
const SYNC_BASE_URL_ENV_KEYS = ['CHATPRISM_SYNC_BASE_URL', 'VITE_SYNC_BASE_URL', 'WXT_SYNC_BASE_URL'] as const;
const PROVIDER_CONFIG_BASE_URL_ENV_KEYS = [
    'CHATPRISM_PROVIDER_CONFIG_BASE_URL',
    'VITE_PROVIDER_CONFIG_BASE_URL',
    'WXT_PROVIDER_CONFIG_BASE_URL'
] as const;

const DEFAULT_ANALYZER_PROMPT = [
    'You are a strict evidence extractor for side-by-side model outputs.',
    'The goal is to show source content from the two answers, not quality evaluation or commentary.',
    'Return ONLY a valid JSON object with these fields: agreements, conflictsA, conflictsB, uniqueA, uniqueB.',
    'Preferred output type for each field is a string. If needed, you may use an array of strings of verbatim snippets.',
    'agreements: summarize overlapping content OR select one better-written original snippet that represents the overlap.',
    'conflictsA/conflictsB: show the conflicting original snippets from A and B separately.',
    'uniqueA/uniqueB: show snippets that exist only in A or only in B.',
    'Preserve original wording as much as possible. Avoid judgments such as "better", "worse", "more accurate".',
    'Do not include markdown fences or extra commentary outside JSON.',
    'User prompt: {prompt}',
    'Model A output: {outputA}',
    'Model B output: {outputB}'
].join('\n\n');

export const APP_CONFIG: { providers: ProviderConfig[]; analyzer: AnalyzerConfig } = {
    providers: [
        {
            id: 'chatgpt-web',
            name: 'ChatGPT (Web)',
            models: [
                { id: 'auto', name: 'Auto (默认)' },
                { id: 'gpt-4o', name: 'GPT-4o' }
            ],
            defaultModel: 'auto',
            preferredDefaultModel: 'gpt5.4thinking',
            supportedRuntimeModes: ['extension']
        },
        {
            id: 'gemini-api',
            name: 'Gemini (API)',
            models: [
                { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
                { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
                { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' }
            ],
            defaultModel: 'gemini-2.5-flash',
            preferredDefaultModel: 'Gemini Pro Latest',
            supportedRuntimeModes: ['extension', 'web']
        }
    ],
    analyzer: {
        defaultProvider: 'gemini-api',
        defaultModel: 'gemini-2.5-flash',
        systemPrompt: DEFAULT_ANALYZER_PROMPT
    }
};

function normalizeSyncKey(value?: string | null): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim();
    return normalized ? normalized : null;
}

function normalizeUrl(value?: string | null): string | null {
    const normalized = normalizeSyncKey(value);
    if (!normalized) {
        return null;
    }

    return normalized.replace(/\/$/, '');
}

function readOptionalPositiveInt(value?: string | null): number | null {
    const normalized = normalizeSyncKey(value);
    if (!normalized) {
        return null;
    }

    const parsed = Number.parseInt(normalized, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function readSyncKey(options: SyncKeyOptions = {}): string {
    const fromStorage = normalizeSyncKey(options.storage?.getItem(SYNC_KEY_STORAGE_KEY));
    if (fromStorage) {
        return fromStorage;
    }

    for (const key of SYNC_KEY_ENV_KEYS) {
        const candidate = normalizeSyncKey(options.env?.[key]);
        if (candidate) {
            return candidate;
        }
    }

    return DEFAULT_SYNC_KEY;
}

export function validateSyncKey(syncKey: string, options: SyncKeyOptions = {}): string {
    const normalized = normalizeSyncKey(syncKey);
    if (!normalized) {
        throw new Error('syncKey 不能为空，请先配置有效的同步命名空间。');
    }

    if (normalized === DEFAULT_SYNC_KEY && !options.isDevelopment) {
        throw new Error('syncKey=0 仅允许在开发环境使用，请先配置真实的 syncKey。');
    }

    return normalized;
}

export function resolveSyncKey(options: SyncKeyOptions = {}): string {
    return validateSyncKey(readSyncKey(options), options);
}

export function readSyncBaseUrl(options: SyncBaseUrlOptions = {}): string {
    for (const key of SYNC_BASE_URL_ENV_KEYS) {
        const candidate = normalizeUrl(options.env?.[key]);
        if (candidate) {
            return candidate;
        }
    }

    return DEFAULT_SYNC_BASE_URL;
}

export function resolveSyncBaseUrl(options: SyncBaseUrlOptions = {}): string {
    return readSyncBaseUrl(options);
}

export function readProviderConfigBaseUrl(options: ProviderConfigBaseUrlOptions = {}): string {
    for (const key of PROVIDER_CONFIG_BASE_URL_ENV_KEYS) {
        const candidate = normalizeUrl(options.env?.[key]);
        if (candidate) {
            return candidate;
        }
    }

    return DEFAULT_PROVIDER_CONFIG_BASE_URL;
}

export function resolveProviderConfigBaseUrl(options: ProviderConfigBaseUrlOptions = {}): string {
    return readProviderConfigBaseUrl(options);
}

export function resolveGeminiHistoryRuntimeConfig(
    options: GeminiHistoryRuntimeConfigOptions = {}
): GeminiHistoryRuntimeConfig {
    const providerConfigBaseUrl = resolveProviderConfigBaseUrl(options);
    const pageOrigin = normalizeUrl(options.env?.CHATPRISM_GEMINI_HISTORY_PAGE_ORIGIN)
        || normalizeUrl(options.env?.WXT_GEMINI_HISTORY_PAGE_ORIGIN)
        || DEFAULT_GEMINI_HISTORY_PAGE_ORIGIN;
    const pageUrl = normalizeUrl(options.env?.CHATPRISM_GEMINI_HISTORY_PAGE_URL)
        || normalizeUrl(options.env?.WXT_GEMINI_HISTORY_PAGE_URL)
        || DEFAULT_GEMINI_HISTORY_PAGE_URL;
    const storageKey = normalizeSyncKey(options.env?.CHATPRISM_GEMINI_HISTORY_CONFIG_STORAGE_KEY)
        || normalizeSyncKey(options.env?.WXT_GEMINI_HISTORY_CONFIG_STORAGE_KEY)
        || DEFAULT_GEMINI_HISTORY_CONFIG_STORAGE_KEY;
    const requestTimeoutMs = readOptionalPositiveInt(options.env?.CHATPRISM_GEMINI_HISTORY_REQUEST_TIMEOUT_MS)
        || readOptionalPositiveInt(options.env?.WXT_GEMINI_HISTORY_REQUEST_TIMEOUT_MS)
        || DEFAULT_GEMINI_HISTORY_REQUEST_TIMEOUT_MS;

    return {
        providerConfigBaseUrl,
        providerConfigPath: `${providerConfigBaseUrl}/gemini-history`,
        pageOrigin,
        pageUrl,
        storageKey,
        requestTimeoutMs
    };
}
