import type { ProviderConfig, ProviderModelCatalog, RuntimeMode } from '../../config';
import type { ResolvedAgentConfig } from '../interfaces/IAgentConfig';
import type { IModelProvider } from '../interfaces/IModelProvider';
import type { MessageAttachment } from '../interfaces/IStorageProvider';
import type { ProviderContextMessage, ProviderSendResult, ProviderStreamUpdate } from '../interfaces/IModelProvider';

export type RuntimeCredentials = Record<string, string | undefined>;
export type RuntimeProviderFactory = (providerId: string, options: ProviderRuntimeOptions) => IModelProvider | undefined;
export type RuntimeProviderOptionsResolver = (providerId: string, options: ProviderRuntimeOptions) => unknown;

export interface ProviderRuntimeOptions {
    runtimeMode: RuntimeMode;
    credentials?: RuntimeCredentials;
    providerFactory?: RuntimeProviderFactory;
    providerOptionsResolver?: RuntimeProviderOptionsResolver;
}

export interface ProviderRuntime {
    getAvailableProviders(): ProviderConfig[];
    getProviderCatalog(): ProviderConfig[];
    getProviderModels(providerId: string): Promise<ProviderModelCatalog>;
    getProvider(providerId: string, options?: { fresh?: boolean }): IModelProvider;
}

export interface AgentRuntimeRequest {
    prompt: string;
    agent: ResolvedAgentConfig | null;
    providerId?: string;
    modelId?: string;
    attachments?: MessageAttachment[];
    history?: ProviderContextMessage[];
    modelOptions?: Record<string, boolean>;
    context?: { parentMessageId?: string, conversationId?: string };
}

export interface AgentRuntime {
    run(
        request: AgentRuntimeRequest,
        onUpdate: (update: ProviderStreamUpdate) => void
    ): Promise<ProviderSendResult>;
    abort(): void;
}
