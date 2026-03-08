import type { ProviderConfig, ProviderModelCatalog, RuntimeMode } from '../../config';
import type { AnalysisResult } from '../analysis/types';
import type { IModelProvider } from '../interfaces/IModelProvider';
import type { ProviderRuntime } from '../runtime/types';

export interface CreateMockRuntimeOptions {
    runtimeMode: RuntimeMode;
    slowStreamTrigger?: string;
    defaultCharDelayMs?: number;
    slowCharDelayMs?: number;
}

function buildMockProviders(runtimeMode: RuntimeMode): ProviderConfig[] {
    return [
        {
            id: 'gemini-api',
            name: 'Gemini (Mock)',
            models: [
                { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Mock)' },
                { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Mock)' }
            ],
            defaultModel: 'gemini-2.5-flash',
            supportedRuntimeModes: [runtimeMode]
        },
        {
            id: 'mock-second',
            name: 'Second Provider (Mock)',
            models: [
                { id: 'second-fast', name: 'Second Fast' },
                { id: 'second-precise', name: 'Second Precise' }
            ],
            defaultModel: 'second-fast',
            supportedRuntimeModes: [runtimeMode]
        }
    ];
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractByLabel(text: string, label: string): string {
    const index = text.indexOf(label);
    if (index === -1) {
        return '';
    }

    const nextLineIndex = text.indexOf('\n', index + label.length);
    if (nextLineIndex === -1) {
        return text.slice(index + label.length).trim();
    }

    return text.slice(index + label.length, nextLineIndex).trim();
}

function excerpt(text: string, maxLen = 96): string {
    if (!text) return '';
    return text.length <= maxLen ? text : `${text.slice(0, maxLen)}...`;
}

class MockStreamingProvider implements IModelProvider {
    public id: string;
    private aborted = false;

    constructor(
        providerId: string,
        private readonly modelCatalog: ProviderModelCatalog,
        private readonly options: {
            defaultCharDelayMs: number;
            slowStreamTrigger: string;
            slowCharDelayMs: number;
        }
    ) {
        this.id = providerId;
    }

    async checkAuth(): Promise<boolean> {
        return true;
    }

    async getAvailableModels(): Promise<ProviderModelCatalog> {
        return {
            models: this.modelCatalog.models.map((model) => ({ ...model })),
            defaultModel: this.modelCatalog.defaultModel
        };
    }

    async sendMessage(
        prompt: string,
        options: {
            context?: { parentMessageId?: string; conversationId?: string };
            modelId?: string;
        } = {},
        onUpdate: (chunk: string) => void
    ): Promise<{ text: string; conversationId: string; messageId: string }> {
        this.aborted = false;

        const isAnalysisPrompt =
            prompt.includes('User prompt:') &&
            prompt.includes('Model A output:') &&
            prompt.includes('Model B output:');
        const userPrompt = extractByLabel(prompt, 'User prompt:');
        const outputA = extractByLabel(prompt, 'Model A output:');
        const outputB = extractByLabel(prompt, 'Model B output:');

        const finalText = isAnalysisPrompt
            ? this.buildAnalysisText(userPrompt, outputA, outputB)
            : this.buildNativeText(prompt, options.modelId);

        const charDelay = prompt.includes(this.options.slowStreamTrigger)
            ? this.options.slowCharDelayMs
            : this.options.defaultCharDelayMs;
        let partial = '';
        for (const char of finalText) {
            if (this.aborted) {
                throw new Error('Request aborted');
            }
            partial += char;
            onUpdate(partial);
            await sleep(charDelay);
        }

        return {
            text: finalText,
            conversationId: options.context?.conversationId || crypto.randomUUID(),
            messageId: crypto.randomUUID()
        };
    }

    abort(): void {
        this.aborted = true;
    }

    private buildNativeText(prompt: string, modelId?: string): string {
        if (prompt.includes('TRIGGER_MARKDOWN_NATIVE')) {
            return [
                `## ${this.id}/${modelId || 'default'} Markdown`,
                '',
                '- 第一条要点',
                '- 第二条要点',
                '',
                '```ts',
                "console.log('markdown from model')",
                '```'
            ].join('\n');
        }

        return `${this.id}/${modelId || 'default'} => ${prompt}`;
    }

    private buildAnalysisText(userPrompt: string, outputA: string, outputB: string): string {
        if (userPrompt.includes('TRIGGER_BAD_ANALYSIS')) {
            return 'INVALID_ANALYSIS_PAYLOAD';
        }

        if (userPrompt.includes('TRIGGER_MD_ARRAY_ANALYSIS')) {
            return [
                '```json',
                JSON.stringify(
                    {
                        agreements: [
                            `共同问题原文：${userPrompt || 'N/A'}`,
                            `A原文片段：${excerpt(outputA)}`,
                            `B原文片段：${excerpt(outputB)}`
                        ],
                        conflictsA: [`${excerpt(outputA)}`],
                        conflictsB: [`${excerpt(outputB)}`],
                        uniqueA: [`${excerpt(outputA)}（A特有片段）`],
                        uniqueB: [`${excerpt(outputB)}（B特有片段）`]
                    },
                    null,
                    2
                ),
                '```'
            ].join('\n');
        }

        return JSON.stringify({
            agreements: `共同问题原文：${userPrompt || 'N/A'}`,
            conflictsA: excerpt(outputA),
            conflictsB: excerpt(outputB),
            uniqueA: `${excerpt(outputA)}（A特有片段）`,
            uniqueB: `${excerpt(outputB)}（B特有片段）`
        } satisfies AnalysisResult);
    }
}

export function createMockRuntime(options: CreateMockRuntimeOptions): ProviderRuntime {
    const cache = new Map<string, IModelProvider>();
    const modelCatalogCache = new Map<string, ProviderModelCatalog>();
    const mockProviders = buildMockProviders(options.runtimeMode);
    const defaultCharDelayMs = options.defaultCharDelayMs ?? 2;
    const slowStreamTrigger = options.slowStreamTrigger ?? 'TRIGGER_SLOW_STREAM';
    const slowCharDelayMs = options.slowCharDelayMs ?? 25;

    return {
        getAvailableProviders() {
            return mockProviders;
        },

        getProviderCatalog() {
            return mockProviders;
        },

        async getProviderModels(providerId: string): Promise<ProviderModelCatalog> {
            const providerConfig = mockProviders.find((item) => item.id === providerId);
            if (!providerConfig) {
                throw new Error(`Mock provider '${providerId}' is not available`);
            }

            const cached = modelCatalogCache.get(providerId);
            if (cached) {
                return cached;
            }

            const catalog = {
                models: providerConfig.models.map((model) => ({ ...model })),
                defaultModel: providerConfig.defaultModel
            };
            modelCatalogCache.set(providerId, catalog);
            return catalog;
        },

        getProvider(providerId: string, getProviderOptions?: { fresh?: boolean }): IModelProvider {
            const providerConfig = mockProviders.find((item) => item.id === providerId);
            if (!providerConfig) {
                throw new Error(`Mock provider '${providerId}' is not available`);
            }

            if (getProviderOptions?.fresh) {
                return new MockStreamingProvider(providerId, {
                    models: providerConfig.models.map((model) => ({ ...model })),
                    defaultModel: providerConfig.defaultModel
                }, {
                    defaultCharDelayMs,
                    slowStreamTrigger,
                    slowCharDelayMs
                });
            }

            const cached = cache.get(providerId);
            if (cached) {
                return cached;
            }

            const instance = new MockStreamingProvider(providerId, {
                models: providerConfig.models.map((model) => ({ ...model })),
                defaultModel: providerConfig.defaultModel
            }, {
                defaultCharDelayMs,
                slowStreamTrigger,
                slowCharDelayMs
            });
            cache.set(providerId, instance);
            return instance;
        }
    };
}
