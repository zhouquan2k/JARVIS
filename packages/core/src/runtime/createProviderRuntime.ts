import { APP_CONFIG } from '../../config';
import { IModelProvider } from '../interfaces/IModelProvider';
import { ChatGPTWebProvider } from '../providers/ChatGPTWebProvider';
import { GeminiApiProvider } from '../providers/GeminiApiProvider';
import { ProviderRuntime, ProviderRuntimeOptions } from './types';

type ProviderFactory = (options: ProviderRuntimeOptions) => IModelProvider;

const DEFAULT_FACTORIES: Record<string, ProviderFactory> = {
    'chatgpt-web': () => new ChatGPTWebProvider(),
    'gemini-api': (options) => new GeminiApiProvider({ apiKey: options.credentials?.geminiApiKey })
};

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

        getProvider(providerId: string) {
            const providerConfig = availableProviders.find((item) => item.id === providerId);
            if (!providerConfig) {
                throw new Error(`Provider '${providerId}' is not available in runtimeMode '${options.runtimeMode}'`);
            }

            const cached = cache.get(providerId);
            if (cached) {
                return cached;
            }

            const factory = DEFAULT_FACTORIES[providerId];
            if (!factory) {
                throw new Error(`No provider factory registered for '${providerId}'`);
            }

            const instance = factory(options);
            cache.set(providerId, instance);
            return instance;
        }
    };
}
