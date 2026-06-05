export type RuntimeMode = 'extension' | 'web' | 'desktop';

export interface ModelOptionDefinition {
    key: string;
    label: string;
    labelKey?: string;
    type: 'boolean';
    description?: string;
    descriptionKey?: string;
    conflictsWith?: string[];
    defaultValue?: boolean;
}

export interface ModelConfig {
    id: string;
    name: string;
    nameKey?: string;
    options?: ModelOptionDefinition[];
}

export interface ProviderModelCatalog {
    models: ModelConfig[];
    defaultModel: string;
}

export interface ProviderConfig {
    id: string;
    name: string;
    nameKey?: string;
    models: ModelConfig[];
    defaultModel: string;
    preferredDefaultModel?: string;
    supportedRuntimeModes: RuntimeMode[];
    enabled?: boolean;
}

export interface LightweightModelSelection {
    providerId: string;
    modelId: string;
    reasoningEffort?: 'low' | 'medium' | 'high';
    modelOptions?: Record<string, boolean>;
}

export interface LightweightModelConfig {
    desktop: LightweightModelSelection;
    web: LightweightModelSelection;
    extension: LightweightModelSelection;
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
export const DEFAULT_CODEX_BASE_URL = 'http://127.0.0.1:8787/api/codex';
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

export interface CodexBaseUrlOptions {
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
const CODEX_BASE_URL_ENV_KEYS = [
    'CHATPRISM_CODEX_BASE_URL',
    'VITE_CODEX_BASE_URL',
    'WXT_CODEX_BASE_URL'
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

export const APP_CONFIG: { providers: ProviderConfig[]; analyzer: AnalyzerConfig; lightweightModels: LightweightModelConfig } = {
    providers: [
        {
            id: 'chatgpt-codex',
            name: 'ChatGPT (Codex)',
            models: [
                {
                    id: 'auto',
                    name: 'Auto (Default)',
                    nameKey: 'model.autoDefault',
                    options: [
                        {
                            key: 'web_search',
                            label: 'Web search',
                            labelKey: 'option.webSearch',
                            type: 'boolean',
                            description: 'Allow Codex to use web search for fresh information.',
                            descriptionKey: 'option.webSearchDescription',
                            conflictsWith: ['deep_research'],
                            defaultValue: false
                        },
                        {
                            key: 'deep_research',
                            label: 'Deep Research',
                            labelKey: 'option.deepResearch',
                            type: 'boolean',
                            description: 'Switch to a heavier research-oriented Codex request.',
                            descriptionKey: 'option.deepResearchDescription',
                            conflictsWith: ['web_search'],
                            defaultValue: false
                        }
                    ]
                },
                {
                    id: 'gpt-5.4',
                    name: 'gpt-5.4',
                    options: [
                        {
                            key: 'web_search',
                            label: 'Web search',
                            labelKey: 'option.webSearch',
                            type: 'boolean',
                            description: 'Allow Codex to use web search for fresh information.',
                            descriptionKey: 'option.webSearchDescription',
                            conflictsWith: ['deep_research'],
                            defaultValue: false
                        },
                        {
                            key: 'deep_research',
                            label: 'Deep Research',
                            labelKey: 'option.deepResearch',
                            type: 'boolean',
                            description: 'Switch to a heavier research-oriented Codex request.',
                            descriptionKey: 'option.deepResearchDescription',
                            conflictsWith: ['web_search'],
                            defaultValue: false
                        }
                    ]
                }
            ],
            defaultModel: 'auto',
            preferredDefaultModel: 'gpt-5.4',
            supportedRuntimeModes: ['extension', 'web', 'desktop']
        },
        {
            id: 'chatgpt-web',
            name: 'ChatGPT (Web)',
            models: [
                {
                    id: 'auto',
                    name: 'Auto (Default)',
                    nameKey: 'model.autoDefault',
                    options: [
                        {
                            key: 'web_search',
                            label: 'Web search',
                            labelKey: 'option.webSearch',
                            type: 'boolean',
                            description: 'Allow the model to use web search for fresh information.',
                            descriptionKey: 'option.webSearchDescription',
                            conflictsWith: ['deep_research'],
                            defaultValue: false
                        },
                        {
                            key: 'deep_research',
                            label: 'Deep Research',
                            labelKey: 'option.deepResearch',
                            type: 'boolean',
                            description: 'Switch to the heavier research request path.',
                            descriptionKey: 'option.deepResearchDescription',
                            conflictsWith: ['web_search'],
                            defaultValue: false
                        }
                    ]
                },
                {
                    id: 'gpt-4o',
                    name: 'GPT-4o',
                    nameKey: 'model.gpt4o',
                    options: [
                        {
                            key: 'web_search',
                            label: 'Web search',
                            labelKey: 'option.webSearch',
                            type: 'boolean',
                            description: 'Allow the model to use web search for fresh information.',
                            descriptionKey: 'option.webSearchDescription',
                            conflictsWith: ['deep_research'],
                            defaultValue: false
                        },
                        {
                            key: 'deep_research',
                            label: 'Deep Research',
                            labelKey: 'option.deepResearch',
                            type: 'boolean',
                            description: 'Switch to the heavier research request path.',
                            descriptionKey: 'option.deepResearchDescription',
                            conflictsWith: ['web_search'],
                            defaultValue: false
                        }
                    ]
                }
            ],
            defaultModel: 'auto',
            preferredDefaultModel: 'gpt5.4thinking',
            supportedRuntimeModes: ['extension', 'desktop']
        },
        {
            id: 'gemini-api',
            name: 'Gemini (API)',
            models: [
                {
                    id: 'gemini-2.5-flash',
                    name: 'Gemini 2.5 Flash',
                    nameKey: 'model.gemini25Flash',
                    options: [
                        {
                            key: 'web_search',
                            label: 'Web search',
                            labelKey: 'option.webSearch',
                            type: 'boolean',
                            description: 'Allow the model to use web search for fresh information.',
                            descriptionKey: 'option.webSearchDescription',
                            conflictsWith: ['deep_research'],
                            defaultValue: false
                        },
                        {
                            key: 'deep_research',
                            label: 'Deep Research',
                            labelKey: 'option.deepResearch',
                            type: 'boolean',
                            description: 'Switch to Gemini’s research request path.',
                            descriptionKey: 'option.deepResearchDescription',
                            conflictsWith: ['web_search'],
                            defaultValue: false
                        }
                    ]
                },
                {
                    id: 'gemini-2.0-flash',
                    name: 'Gemini 2.0 Flash',
                    nameKey: 'model.gemini20Flash',
                    options: [
                        {
                            key: 'web_search',
                            label: 'Web search',
                            labelKey: 'option.webSearch',
                            type: 'boolean',
                            description: 'Allow the model to use web search for fresh information.',
                            descriptionKey: 'option.webSearchDescription',
                            conflictsWith: ['deep_research'],
                            defaultValue: false
                        },
                        {
                            key: 'deep_research',
                            label: 'Deep Research',
                            labelKey: 'option.deepResearch',
                            type: 'boolean',
                            description: 'Switch to Gemini’s research request path.',
                            descriptionKey: 'option.deepResearchDescription',
                            conflictsWith: ['web_search'],
                            defaultValue: false
                        }
                    ]
                },
                {
                    id: 'gemini-pro-latest',
                    name: 'Gemini Pro Latest',
                    nameKey: 'model.geminiProLatest',
                    options: [
                        {
                            key: 'web_search',
                            label: 'Web search',
                            labelKey: 'option.webSearch',
                            type: 'boolean',
                            description: 'Allow the model to use web search for fresh information.',
                            descriptionKey: 'option.webSearchDescription',
                            conflictsWith: ['deep_research'],
                            defaultValue: false
                        },
                        {
                            key: 'deep_research',
                            label: 'Deep Research',
                            labelKey: 'option.deepResearch',
                            type: 'boolean',
                            description: 'Switch to Gemini’s research request path.',
                            descriptionKey: 'option.deepResearchDescription',
                            conflictsWith: ['web_search'],
                            defaultValue: false
                        }
                    ]
                },
                {
                    id: 'gemini-2.5-pro',
                    name: 'Gemini 2.5 Pro',
                    nameKey: 'model.gemini25Pro',
                    options: [
                        {
                            key: 'web_search',
                            label: 'Web search',
                            labelKey: 'option.webSearch',
                            type: 'boolean',
                            description: 'Allow the model to use web search for fresh information.',
                            descriptionKey: 'option.webSearchDescription',
                            conflictsWith: ['deep_research'],
                            defaultValue: false
                        },
                        {
                            key: 'deep_research',
                            label: 'Deep Research',
                            labelKey: 'option.deepResearch',
                            type: 'boolean',
                            description: 'Switch to Gemini’s research request path.',
                            descriptionKey: 'option.deepResearchDescription',
                            conflictsWith: ['web_search'],
                            defaultValue: false
                        }
                    ]
                }
            ],
            defaultModel: 'gemini-pro-latest',
            preferredDefaultModel: 'Gemini Pro Latest',
            supportedRuntimeModes: ['extension', 'web', 'desktop']
        }
    ],
    analyzer: {
        defaultProvider: 'gemini-api',
        defaultModel: 'gemini-pro-latest',
        systemPrompt: DEFAULT_ANALYZER_PROMPT
    },
    lightweightModels: {
        desktop: {
            providerId: 'chatgpt-web',
            modelId: 'gpt-4o',
            reasoningEffort: 'low',
            modelOptions: {
                web_search: false,
                deep_research: false
            }
        },
        web: {
            providerId: 'chatgpt-codex',
            modelId: 'gpt-5.4',
            reasoningEffort: 'low',
            modelOptions: {
                web_search: false,
                deep_research: false
            }
        },
        extension: {
            providerId: 'chatgpt-web',
            modelId: 'gpt-4o',
            reasoningEffort: 'low',
            modelOptions: {
                web_search: false,
                deep_research: false
            }
        }
    }
};

export function resolveLightweightModelSelection(runtimeMode: RuntimeMode): LightweightModelSelection {
    return APP_CONFIG.lightweightModels[runtimeMode];
}

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
        throw new Error('syncKey cannot be empty. Configure a valid sync namespace first.');
    }

    if (normalized === DEFAULT_SYNC_KEY && !options.isDevelopment) {
        throw new Error('syncKey=0 is only allowed in development; configure a real syncKey first.');
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

export function readCodexBaseUrl(options: CodexBaseUrlOptions = {}): string {
    for (const key of CODEX_BASE_URL_ENV_KEYS) {
        const candidate = normalizeUrl(options.env?.[key]);
        if (candidate) {
            return candidate;
        }
    }

    const syncBaseUrl = resolveSyncBaseUrl({ env: options.env });
    if (syncBaseUrl !== DEFAULT_SYNC_BASE_URL && syncBaseUrl.endsWith('/api/sync')) {
        return `${syncBaseUrl.slice(0, -'/api/sync'.length)}/api/codex`;
    }

    return DEFAULT_CODEX_BASE_URL;
}

export function resolveCodexBaseUrl(options: CodexBaseUrlOptions = {}): string {
    return readCodexBaseUrl(options);
}

export const DEFAULT_CONTEXT_BASE_URL = 'http://127.0.0.1:8787/api/context';

export interface ResolveContextBaseUrlOptions {
    env?: Record<string, string | undefined>;
}

function hasEnvContainer(
    value: ResolveContextBaseUrlOptions | Record<string, string | undefined>
): value is ResolveContextBaseUrlOptions {
    return 'env' in value;
}

export function resolveContextBaseUrl(
    options: ResolveContextBaseUrlOptions | Record<string, string | undefined> = {}
): string {
    const env = hasEnvContainer(options) ? options.env : options;
    const explicit = env?.CHATPRISM_CONTEXT_BASE_URL?.trim()
        || env?.VITE_CONTEXT_BASE_URL?.trim()
        || env?.WXT_CONTEXT_BASE_URL?.trim();
    if (explicit) {
        return explicit.replace(/\/+$/, '');
    }

    const syncBaseUrl = resolveSyncBaseUrl({ env });
    if (syncBaseUrl !== DEFAULT_SYNC_BASE_URL && syncBaseUrl.endsWith('/api/sync')) {
        return `${syncBaseUrl.slice(0, -'/api/sync'.length)}/api/context`;
    }

    return DEFAULT_CONTEXT_BASE_URL;
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
