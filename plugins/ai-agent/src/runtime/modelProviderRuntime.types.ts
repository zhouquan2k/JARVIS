import type { ProviderConfig, ProviderModelCatalog, RuntimeMode } from '@packages/core/config';
import type { ControlledPageCapability } from '@packages/core/src/interfaces/ControlledPageCapability';
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
    controlledPageCapability?: ControlledPageCapability;
    /** Override target URLs for DOM providers (e.g. point to a local mock in tests). */
    domProviderUrls?: Partial<Record<'chatgpt-dom' | 'gemini-dom', string>>;
}

export interface ModelProviderRuntime {
    getAvailableProviders(): ProviderConfig[];
    getProviderCatalog(): ProviderConfig[];
    getProviderModels(providerId: string): Promise<ProviderModelCatalog>;
    getProvider(providerId: string, options?: { fresh?: boolean }): IModelProvider;
}

export type RuntimeProviderFactory = ModelProviderFactory;
export type RuntimeProviderOptionsResolver = ModelProviderOptionsResolver;
