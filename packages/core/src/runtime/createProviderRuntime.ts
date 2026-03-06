import { APP_CONFIG } from '../../config';
import { IModelProvider } from '../interfaces/IModelProvider';
import { ChatGPTWebProvider } from '../providers/ChatGPTWebProvider';
import { GeminiApiProvider } from '../providers/GeminiApiProvider';
import { ProviderRuntime, ProviderRuntimeOptions, RuntimeProviderFactory } from './types';

type ProviderFactory = (options: ProviderRuntimeOptions) => IModelProvider;

const DEFAULT_FACTORIES: Record<string, ProviderFactory> = {
    'chatgpt-web': () => new ChatGPTWebProvider(),
    'gemini-api': (options) => new GeminiApiProvider({ apiKey: options.credentials?.geminiApiKey })
};

function createProviderInstance(
    providerId: string,
    options: ProviderRuntimeOptions,
    customFactory?: RuntimeProviderFactory
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

export function createProviderRuntime(options: ProviderRuntimeOptions): ProviderRuntime {
    const cache = new Map<string, IModelProvider>();

    const availableProviders = APP_CONFIG.providers.filter((provider) => {
        if (provider.enabled === false) return false;
        return provider.supportedRuntimeModes.includes(options.runtimeMode);
    });

    return {
        getAvailableProviders() {
            return availableProviders;
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
