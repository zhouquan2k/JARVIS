import type {
    ContributionQuery,
    IHostContext,
    PluginEnablementConfig,
    WorkspaceRuntimeContext
} from '@packages/core';
import { createBuiltinPluginRuntime } from '@packages/plugin-system';

export type WorkspaceHostRuntimeMode = 'web' | 'desktop' | 'extension';

export interface CreateBuiltinWorkspaceRuntimeOptions {
    hostContext: IHostContext;
    runtimeMode: WorkspaceHostRuntimeMode;
    env?: Record<string, string | undefined>;
    isDevelopment?: boolean;
    storage?: Pick<Storage, 'getItem' | 'setItem'>;
    codexBaseUrl?: string;
    useMockRuntime?: boolean;
    useMockSync?: boolean;
    useMockHistoryProviders?: boolean;
    mockSyncKeyFallback?: string;
    pluginEnablement: PluginEnablementConfig;
}

export interface BuiltinWorkspaceRuntimeResult {
    contributionQuery: ContributionQuery;
    runtimeContext: WorkspaceRuntimeContext;
}

export async function createBuiltinWorkspaceRuntime(
    options: CreateBuiltinWorkspaceRuntimeOptions
): Promise<BuiltinWorkspaceRuntimeResult> {
    return createBuiltinPluginRuntime({
        hostContext: options.hostContext,
        runtimeMode: options.runtimeMode,
        env: options.env,
        isDevelopment: options.isDevelopment,
        storage: options.storage,
        codexBaseUrl: options.codexBaseUrl,
        useMockRuntime: options.useMockRuntime,
        useMockSync: options.useMockSync,
        useMockHistoryProviders: options.useMockHistoryProviders,
        mockSyncKeyFallback: options.mockSyncKeyFallback
    }, options.pluginEnablement);
}
