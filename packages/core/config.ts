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
    reasoningEffort?: 'low' | 'medium' | 'high';
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
    requiredCapabilities?: string[];
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

export interface GroupMemberConfig {
    providerId: string;
    modelId: string;
    name: string;
}

export interface GroupSummarizerConfig {
    providerId: string;
    modelId: string;
    systemPrompt?: string;
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

export const APP_CONFIG: {
    providers: ProviderConfig[];
    defaultProvidersByMode: Partial<Record<RuntimeMode, string>>;
    analyzer: AnalyzerConfig;
    lightweightModels: LightweightModelConfig;
    groupPresets: Record<string, GroupMemberConfig[]>;
    /** 群聊可选成员池：顶部勾选区展示的全部候选 DOM 成员（实际可用性再按运行模式过滤）。 */
    groupCandidates: GroupMemberConfig[];
    /** 按群预设 ID 配置总结模型；undefined 表示该预设不启用自动总结。 */
    groupSummarizers: Record<string, GroupSummarizerConfig>;
} = {
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
        },
        {
            id: 'group',
            name: 'Group (Multi-Model)',
            models: [
                {
                    id: 'dom',
                    name: 'Group (DOM)',
                    // group 统一档位，由 MultiModelGroupProvider 下发给所有成员；high = Thinking/扩展。
                    reasoningEffort: 'high' as const,
                    options: [
                        {
                            key: 'web_search',
                            label: 'Web search',
                            labelKey: 'option.webSearch',
                            type: 'boolean' as const,
                            description: 'Enable web search for all group members.',
                            descriptionKey: 'option.webSearchDescription',
                            defaultValue: false
                        }
                    ]
                }
            ],
            defaultModel: 'dom',
            supportedRuntimeModes: ['desktop'],
            requiredCapabilities: ['controlled-page']
        },
        {
            id: 'chatgpt-dom',
            name: 'ChatGPT (DOM)',
            models: [
                {
                    id: 'dom',
                    name: 'ChatGPT (DOM)',
                    // __composer-pill 里的 Thinking/Instant 映射为推理档位而非模型，
                    // 由 setReasoningEffort 驱动；此处 reasoningEffort:'high' 设默认档为 Thinking。
                    reasoningEffort: 'high' as const,
                    options: [
                        {
                            key: 'web_search',
                            label: 'Web search',
                            labelKey: 'option.webSearch',
                            type: 'boolean' as const,
                            description: 'Enable web search in ChatGPT.',
                            descriptionKey: 'option.webSearchDescription',
                            defaultValue: false
                        }
                    ]
                }
            ],
            defaultModel: 'dom',
            // 群聊 DOM 模式下跟随此默认模型（无法逐个手选时的兜底）。
            preferredDefaultModel: 'GPT-5.5',
            supportedRuntimeModes: ['desktop'],
            requiredCapabilities: ['controlled-page']
        },
        {
            id: 'gemini-dom',
            name: 'Gemini (DOM)',
            models: [
                {
                    id: 'dom',
                    name: 'Gemini (DOM)',
                    // 思考等级「标准/扩展」映射为推理档位，由 setReasoningEffort 驱动；
                    // reasoningEffort:'high' 设默认档为「扩展」思考。
                    reasoningEffort: 'high' as const,
                    options: [
                        {
                            key: 'web_search',
                            label: 'Web search',
                            labelKey: 'option.webSearch',
                            type: 'boolean' as const,
                            description: 'Enable web search in Gemini.',
                            descriptionKey: 'option.webSearchDescription',
                            defaultValue: false
                        }
                    ]
                }
            ],
            defaultModel: 'dom',
            // 动态目录就绪后默认选中 "3.1 Pro"（Gemini 高推理模型）。
            preferredDefaultModel: '3.1 Pro',
            supportedRuntimeModes: ['desktop'],
            requiredCapabilities: ['controlled-page']
        },
        {
            id: 'claude-dom',
            name: 'Claude (DOM)',
            models: [
                {
                    id: 'dom',
                    name: 'Claude (DOM)',
                    // Claude extended thinking 由 setReasoningEffort 驱动（选择器待验证）；
                    // reasoningEffort:'high' 设默认档为「扩展」思考。
                    reasoningEffort: 'high' as const,
                    options: []
                }
            ],
            defaultModel: 'dom',
            // 动态目录就绪后默认选中 "Opus 4.8"（Claude 高能力模型，支持 extended thinking）。
            preferredDefaultModel: 'Opus 4.8',
            supportedRuntimeModes: ['desktop'],
            requiredCapabilities: ['controlled-page']
        }
    ],
    defaultProvidersByMode: {
        web: 'gemini-api',
        desktop: 'gemini-dom'
    },
    groupPresets: {
        // 群聊 DOM 模式：各成员使用 provider 的 preferredDefaultModel，无需用户逐个手选。
        'dom': [
            { providerId: 'chatgpt-dom', modelId: 'GPT-5.5', name: 'ChatGPT' },
            { providerId: 'gemini-dom', modelId: '3.1 Pro', name: 'Gemini' }
        ]
    },
    // 群聊顶部勾选区的候选成员（含默认未勾选项，如 Claude）。
    // modelId 使用各 provider 的 preferredDefaultModel，使 group 模式下页面自动切换到对应模型。
    groupCandidates: [
        { providerId: 'chatgpt-dom', modelId: 'GPT-5.5', name: 'ChatGPT' },
        { providerId: 'gemini-dom', modelId: '3.1 Pro', name: 'Gemini' },
        { providerId: 'claude-dom', modelId: 'Opus 4.8', name: 'Claude' }
    ],
    groupSummarizers: {
        'dom': {
            providerId: 'gemini-dom-summary',
            modelId: '3.1 Pro'
        }
    },
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
