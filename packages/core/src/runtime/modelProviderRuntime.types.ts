import type { ProviderConfig, ProviderModelCatalog, RuntimeMode } from '../../config';
import type { IModelProvider } from '../interfaces/IModelProvider';

export type RuntimeCredentials = Record<string, string | undefined>;
export type ModelProviderFactory = (
    providerId: string,
    options: ModelProviderRuntimeOptions
) => IModelProvider | undefined;
export type ModelProviderOptionsResolver = (
    providerId: string,
    options: ModelProviderRuntimeOptions
) => unknown;

export interface ModelProviderRuntimeOptions {
    runtimeMode: RuntimeMode;
    credentials?: RuntimeCredentials;
    providerFactory?: ModelProviderFactory;
    providerOptionsResolver?: ModelProviderOptionsResolver;
}

export interface ModelProviderRuntime {
    getAvailableProviders(): ProviderConfig[];
    getProviderCatalog(): ProviderConfig[];
    getProviderModels(providerId: string): Promise<ProviderModelCatalog>;
    getProvider(providerId: string, options?: { fresh?: boolean }): IModelProvider;
}

export type RuntimeProviderFactory = ModelProviderFactory;
export type RuntimeProviderOptionsResolver = ModelProviderOptionsResolver;
export interface ProviderRuntimeOptions extends ModelProviderRuntimeOptions {}
export interface ProviderRuntime extends ModelProviderRuntime {}
