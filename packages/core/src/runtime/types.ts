import type { ProviderConfig, RuntimeMode } from '../../config';
import type { IModelProvider } from '../interfaces/IModelProvider';

export type RuntimeCredentials = Record<string, string | undefined>;

export interface ProviderRuntimeOptions {
    runtimeMode: RuntimeMode;
    credentials?: RuntimeCredentials;
}

export interface ProviderRuntime {
    getAvailableProviders(): ProviderConfig[];
    getProvider(providerId: string): IModelProvider;
}
