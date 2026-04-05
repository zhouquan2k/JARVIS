import { APP_CONFIG, type ModelConfig, type ProviderConfig, type ProviderModelCatalog } from '../../config';
import { IModelProvider } from '../interfaces/IModelProvider';
import { ChatGPTWebProvider } from '../providers/model/ChatGPTWebProvider';
import type { ChatGPTWebProviderOptions } from '../providers/model/providerHostTypes';
import { GeminiApiProvider } from '../providers/model/GeminiApiProvider';
import type {
    ModelProviderFactory,
    ModelProviderRuntime,
    ModelProviderRuntimeOptions
} from './modelProviderRuntime.types';

type ProviderFactory = (options: ModelProviderRuntimeOptions) => IModelProvider;

const DEFAULT_FACTORIES: Record<string, ProviderFactory> = {
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

    const availableProviders = APP_CONFIG.providers.filter((provider) => {
        if (provider.enabled === false) return false;
        return provider.supportedRuntimeModes.includes(options.runtimeMode);
    });

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

                try {
                    const provider = this.getProvider(providerId);
                    const dynamicCatalog = await provider.getAvailableModels();
                    const validatedCatalog = applyConfiguredDefaultModel(
                        providerId,
                        validateProviderCatalog(providerId, dynamicCatalog),
                        providerConfig
                    );
                    modelCatalogCache.set(providerId, validatedCatalog);
                    return validatedCatalog;
                } catch {
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
