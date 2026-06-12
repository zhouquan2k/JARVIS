import { APP_CONFIG, type ModelConfig, type ProviderConfig, type ProviderModelCatalog } from '@packages/core/config';
import { IModelProvider } from '../interfaces/IModelProvider';
import { ChatGPTCodexProvider } from '../providers/model/ChatGPTCodexProvider';
import { ChatGPTWebProvider } from '../providers/model/ChatGPTWebProvider';
import type { ChatGPTCodexProviderOptions, ChatGPTWebProviderOptions } from '../providers/model/providerHostTypes';
import { GeminiApiProvider } from '../providers/model/GeminiApiProvider';
import { MultiModelGroupProvider, resolveGroupMembers } from '../providers/model/MultiModelGroupProvider';
import { DomAutomationProvider, isModelsNotReadyError } from '../providers/model/dom/DomAutomationProvider';
import { createDomTransport } from '../providers/model/dom/domTransport';
import type {
    ModelProviderFactory,
    ModelProviderRuntime,
    ModelProviderRuntimeOptions
} from './modelProviderRuntime.types';

type ProviderFactory = (options: ModelProviderRuntimeOptions) => IModelProvider;

const DEFAULT_FACTORIES: Record<string, ProviderFactory> = {
    'chatgpt-codex': (options) => new ChatGPTCodexProvider(
        options.providerOptionsResolver?.('chatgpt-codex', options) as ChatGPTCodexProviderOptions | undefined
    ),
    'chatgpt-web': (options) => new ChatGPTWebProvider(
        options.providerOptionsResolver?.('chatgpt-web', options) as ChatGPTWebProviderOptions | undefined
    ),
    'gemini-api': (options) => new GeminiApiProvider({ apiKey: options.credentials?.geminiApiKey })
};

function createProviderInstance(
    providerId: string,
    options: ModelProviderRuntimeOptions,
    customFactory?: ModelProviderFactory
): IModelProvider {
    const customInstance = customFactory?.(providerId, options);
    if (customInstance) {
        return customInstance;
    }

    const factory = DEFAULT_FACTORIES[providerId];
    if (!factory) {
        throw new Error(`No provider factory registered for '${providerId}'`);
    }
    return factory(options);
}

function getStaticProviderCatalog(providerId: string, availableProviders: ProviderConfig[]): ProviderModelCatalog {
    const providerConfig = availableProviders.find((item) => item.id === providerId);
    if (!providerConfig) {
        throw new Error(`Provider '${providerId}' is not available`);
    }

    return {
        models: providerConfig.models.map(cloneModelConfig),
        defaultModel: providerConfig.defaultModel
    };
}

function cloneModelConfig(model: ModelConfig): ModelConfig {
    return {
        ...model,
        options: model.options?.map((option) => ({
            ...option,
            conflictsWith: option.conflictsWith ? [...option.conflictsWith] : undefined
        }))
    };
}

function mergeModelOptions(model: ModelConfig, providerConfig: ProviderConfig): ModelConfig {
    const staticModel = providerConfig.models.find((item) => item.id === model.id);
    if (!staticModel?.options?.length) {
        return cloneModelConfig(model);
    }

    return {
        ...cloneModelConfig(model),
        options: staticModel.options.map((option) => ({
            ...option,
            conflictsWith: option.conflictsWith ? [...option.conflictsWith] : undefined
        }))
    };
}

function validateProviderCatalog(providerId: string, catalog: ProviderModelCatalog): ProviderModelCatalog {
    if (!Array.isArray(catalog.models) || catalog.models.length === 0) {
        throw new Error(`Provider '${providerId}' returned an empty model catalog`);
    }

    if (!catalog.models.some((model) => model.id === catalog.defaultModel)) {
        throw new Error(`Provider '${providerId}' returned an invalid defaultModel '${catalog.defaultModel}'`);
    }

    const providerConfig = APP_CONFIG.providers.find((provider) => provider.id === providerId);
    return {
        models: catalog.models.map((model) => providerConfig ? mergeModelOptions(model, providerConfig) : cloneModelConfig(model)),
        defaultModel: catalog.defaultModel
    };
}

function normalizeModelToken(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function applyConfiguredDefaultModel(
    providerId: string,
    catalog: ProviderModelCatalog,
    providerConfig: ProviderConfig
): ProviderModelCatalog {
    const configuredDefaultModel = providerConfig.preferredDefaultModel?.trim();
    if (!configuredDefaultModel) {
        return catalog;
    }

    const normalizedConfiguredValue = normalizeModelToken(configuredDefaultModel);
    const matchedModel = catalog.models.find((model) => {
        return model.id === configuredDefaultModel
            || model.name === configuredDefaultModel
            || normalizeModelToken(model.id) === normalizedConfiguredValue
            || normalizeModelToken(model.name) === normalizedConfiguredValue;
    });

    if (!matchedModel) {
        console.warn(
            `Configured default model '${configuredDefaultModel}' was not found in available models for provider '${providerId}', falling back to provider catalog default '${catalog.defaultModel}'.`
        );
        return {
            models: catalog.models.map(cloneModelConfig),
            defaultModel: catalog.defaultModel
        };
    }

    return {
        models: catalog.models.map(cloneModelConfig),
        defaultModel: matchedModel.id
    };
}

export function createModelProviderRuntime(options: ModelProviderRuntimeOptions): ModelProviderRuntime {
    const cache = new Map<string, IModelProvider>();
    const modelCatalogCache = new Map<string, ProviderModelCatalog>();
    const inflightModelCatalogRequests = new Map<string, Promise<ProviderModelCatalog>>();

    const filteredProviders = APP_CONFIG.providers.filter((provider) => {
        if (provider.enabled === false) return false;
        if (!provider.supportedRuntimeModes.includes(options.runtimeMode)) return false;
        return (provider.requiredCapabilities ?? []).every((cap) => {
            if (cap === 'controlled-page') return options.controlledPageCapability != null;
            return true;
        });
    });
    const defaultProviderId = APP_CONFIG.defaultProvidersByMode[options.runtimeMode];
    const availableProviders = defaultProviderId
        ? [
              ...filteredProviders.filter((p) => p.id === defaultProviderId),
              ...filteredProviders.filter((p) => p.id !== defaultProviderId)
          ]
        : filteredProviders;

    return {
        getAvailableProviders() {
            return availableProviders;
        },

        getProviderCatalog() {
            return availableProviders;
        },

        async getProviderModels(providerId: string) {
            const cachedCatalog = modelCatalogCache.get(providerId);
            if (cachedCatalog) {
                return cachedCatalog;
            }

            const inflightRequest = inflightModelCatalogRequests.get(providerId);
            if (inflightRequest) {
                return inflightRequest;
            }

            const request = (async () => {
                const providerConfig = availableProviders.find((item) => item.id === providerId);
                if (!providerConfig) {
                    throw new Error(`Provider '${providerId}' is not available in runtimeMode '${options.runtimeMode}'`);
                }

                const fallbackCatalog = getStaticProviderCatalog(providerId, availableProviders);

                console.log('[ModelProviderRuntime]', JSON.stringify({
                    stage: 'getProviderModels-start',
                    providerId
                }));
                try {
                    const provider = this.getProvider(providerId);
                    const dynamicCatalog = await provider.getAvailableModels();
                    const validatedCatalog = applyConfiguredDefaultModel(
                        providerId,
                        validateProviderCatalog(providerId, dynamicCatalog),
                        providerConfig
                    );
                    console.log('[ModelProviderRuntime]', JSON.stringify({
                        stage: 'getProviderModels-success',
                        providerId,
                        count: validatedCatalog.models.length,
                        defaultModel: validatedCatalog.defaultModel
                    }));
                    modelCatalogCache.set(providerId, validatedCatalog);
                    return validatedCatalog;
                } catch (error) {
                    // 模型选择器尚未就绪（DOM provider 页面刚导航/未水合/未登录）：
                    // 「不缓存」并向上抛出，让 store 应用静态兜底但保持可重试（下次重开 provider 再读）。
                    if (isModelsNotReadyError(error)) {
                        console.warn('[ModelProviderRuntime]', JSON.stringify({
                            stage: 'models-not-ready-retryable',
                            providerId
                        }));
                        throw error;
                    }
                    console.warn('[ModelProviderRuntime]', JSON.stringify({
                        stage: 'getProviderModels-fallback',
                        providerId,
                        error: error instanceof Error ? error.message : String(error)
                    }));
                    modelCatalogCache.set(providerId, fallbackCatalog);
                    return fallbackCatalog;
                } finally {
                    inflightModelCatalogRequests.delete(providerId);
                }
            })();

            inflightModelCatalogRequests.set(providerId, request);
            return request;
        },

        getProvider(providerId: string, getProviderOptions?: { fresh?: boolean }) {
            const providerConfig = availableProviders.find((item) => item.id === providerId);
            if (!providerConfig) {
                throw new Error(`Provider '${providerId}' is not available in runtimeMode '${options.runtimeMode}'`);
            }

            if (providerId === 'group') {
                const runtime = this;
                return new MultiModelGroupProvider({
                    resolveMemberProvider: (id) => runtime.getProvider(id, { fresh: true }),
                    getGroupConfig: (presetModelId) => ({
                        members: resolveGroupMembers(presetModelId ?? providerConfig.defaultModel)
                    })
                });
            }

            const domProviderTargetUrls: Record<string, string> = {
                'chatgpt-dom': options.domProviderUrls?.['chatgpt-dom'] ?? 'https://chatgpt.com',
                'gemini-dom': options.domProviderUrls?.['gemini-dom'] ?? 'https://gemini.google.com/app',
                'claude-dom': options.domProviderUrls?.['claude-dom'] ?? 'https://claude.ai/new'
            };
            if (providerId in domProviderTargetUrls && options.controlledPageCapability) {
                const targetUrl = domProviderTargetUrls[providerId];
                return new DomAutomationProvider({
                    id: providerId,
                    label: providerConfig.name,
                    // 传递静态 config 中第一个模型的 options/reasoningEffort，
                    // 使动态获取的模型条目也携带相同选项定义和默认推理档位。
                    modelOptions: providerConfig.models[0]?.options,
                    defaultReasoningEffort: providerConfig.models[0]?.reasoningEffort,
                    transport: createDomTransport({
                        providerId,
                        targetUrl,
                        capability: options.controlledPageCapability
                    })
                });
            }

            const shouldUseFreshInstance = getProviderOptions?.fresh === true;
            if (shouldUseFreshInstance) {
                return createProviderInstance(providerId, options, options.providerFactory);
            }

            const cached = cache.get(providerId);
            if (cached) {
                return cached;
            }

            const instance = createProviderInstance(providerId, options, options.providerFactory);
            cache.set(providerId, instance);
            return instance;
        }
    };
}
