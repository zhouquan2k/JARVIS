import type { ProviderConfig, RuntimeMode } from '../../config';
import type { IModelProvider } from '../interfaces/IModelProvider';

export type RuntimeCredentials = Record<string, string | undefined>;
export type RuntimeProviderFactory = (providerId: string, options: ProviderRuntimeOptions) => IModelProvider | undefined;

export interface ProviderRuntimeOptions {
    runtimeMode: RuntimeMode;
    credentials?: RuntimeCredentials;
    providerFactory?: RuntimeProviderFactory;
}

export interface ProviderRuntime {
    getAvailableProviders(): ProviderConfig[];
    getProvider(providerId: string, options?: { fresh?: boolean }): IModelProvider;
}
