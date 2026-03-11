import { APP_CONFIG, type ModelConfig, type ProviderConfig, type ProviderModelCatalog, type RuntimeMode } from '../../config';
import type { AnalysisResult } from '../analysis/types';
import type { IModelProvider, ProviderSendResult, ProviderStreamUpdate, SendMessageOptions } from '../interfaces/IModelProvider';
import type { MessageAnnotation } from '../interfaces/IStorageProvider';
import type { ProviderRuntime } from '../runtime/types';

export interface CreateMockRuntimeOptions {
    runtimeMode: RuntimeMode;
    slowStreamTrigger?: string;
    defaultCharDelayMs?: number;
    slowCharDelayMs?: number;
}

function buildMockProviders(runtimeMode: RuntimeMode): ProviderConfig[] {
    return APP_CONFIG.providers
        .filter((provider) => provider.supportedRuntimeModes.includes(runtimeMode))
        .map((provider) => ({
            ...provider,
            name: provider.name.includes('(Mock)') ? provider.name : `${provider.name} (Mock)`,
            supportedRuntimeModes: [runtimeMode],
            models: ensurePreferredDefaultModel(provider).map((model) => ({ ...model }))
        }));
}

function normalizeModelToken(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function toMockModelId(providerId: string, preferredDefaultModel: string): string {
    return `${providerId}-${normalizeModelToken(preferredDefaultModel) || 'preferred-default'}`;
}

function ensurePreferredDefaultModel(provider: ProviderConfig): ModelConfig[] {
    const models = provider.models.map((model) => ({ ...model }));
    const preferredDefaultModel = provider.preferredDefaultModel?.trim();
    if (!preferredDefaultModel) {
        return models;
    }

    const normalizedPreferred = normalizeModelToken(preferredDefaultModel);
    const hasMatch = models.some((model) => {
        return model.id === preferredDefaultModel
            || model.name === preferredDefaultModel
            || normalizeModelToken(model.id) === normalizedPreferred
            || normalizeModelToken(model.name) === normalizedPreferred;
    });

    if (hasMatch) {
        return models;
    }

    models.push({
        id: toMockModelId(provider.id, preferredDefaultModel),
        name: preferredDefaultModel
    });
    return models;
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

function buildStructuredMockResponse(providerId: string, modelId?: string): { text: string; annotations?: MessageAnnotation[] } {
    const text = `${providerId}/${modelId || 'default'} 返回了结构化消息 [1]`;
    return {
        text,
        annotations: [
            {
                kind: 'cite',
                range: { start: text.length - 3, end: text.length },
                payload: {
                    refId: 'ref-1',
                    label: '[1]',
                    title: 'Mock Source',
                    url: 'https://example.com/mock-source',
                    snippet: 'Mock citation payload'
                }
            },
            {
                kind: 'image_group',
                range: null,
                payload: {
                    groupId: 'mock-gallery',
                    images: [
                        {
                            id: 'mock-image-1',
                            mimeType: 'image/png',
                            previewBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2ZQ1EAAAAASUVORK5CYII=',
                            alt: 'Mock image'
                        }
                    ]
                }
            }
        ]
    };
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
        options: SendMessageOptions = {},
        onUpdate: (update: ProviderStreamUpdate) => void
    ): Promise<ProviderSendResult> {
        this.aborted = false;

        const isAnalysisPrompt =
            prompt.includes('User prompt:') &&
            prompt.includes('Model A output:') &&
            prompt.includes('Model B output:');
        const userPrompt = extractByLabel(prompt, 'User prompt:');
        const outputA = extractByLabel(prompt, 'Model A output:');
        const outputB = extractByLabel(prompt, 'Model B output:');

        const structuredResponse = prompt.includes('TRIGGER_ANNOTATED_NATIVE')
            ? buildStructuredMockResponse(this.id, options.modelId)
            : null;
        const finalText = isAnalysisPrompt
            ? this.buildAnalysisText(userPrompt, outputA, outputB)
            : structuredResponse?.text || this.buildNativeText(prompt, options.modelId);

        const charDelay = prompt.includes(this.options.slowStreamTrigger)
            ? this.options.slowCharDelayMs
            : this.options.defaultCharDelayMs;
        let partial = '';
        for (const char of finalText) {
            if (this.aborted) {
                throw new Error('Request aborted');
            }
            partial += char;
            onUpdate({
                text: partial,
                annotations: structuredResponse && partial.length === finalText.length
                    ? structuredResponse.annotations
                    : undefined
            });
            await sleep(charDelay);
        }

        return {
            text: finalText,
            conversationId: options.context?.conversationId || crypto.randomUUID(),
            messageId: crypto.randomUUID(),
            annotations: structuredResponse?.annotations
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
