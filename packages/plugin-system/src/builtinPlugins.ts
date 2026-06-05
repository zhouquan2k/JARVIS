import type {
    ContributionQuery,
    IHostContext,
    PluginEnablementConfig,
    PluginManifest,
    WorkspaceRuntimeContext
} from '@packages/core';
import { createAiAgentPlugin } from '../../../plugins/ai-agent/src';
import { taskMgrPlugin } from '../../../plugins/task-mgr/src';
import { PluginManager } from './PluginManager';
import { PluginRegistry } from './PluginRegistry';
import { createWorkspaceRuntimeContext } from './createWorkspaceRuntimeContext';

export type PluginHostRuntimeMode = 'web' | 'desktop' | 'extension';

export interface BuiltinPluginHostContext {
    hostContext: IHostContext;
    runtimeMode: PluginHostRuntimeMode;
    env?: Record<string, string | undefined>;
    isDevelopment?: boolean;
    storage?: Pick<Storage, 'getItem' | 'setItem'>;
    codexBaseUrl?: string;
    useMockRuntime?: boolean;
    useMockSync?: boolean;
    useMockHistoryProviders?: boolean;
    mockSyncKeyFallback?: string;
}

export interface BuiltinPluginRuntime {
    contributionQuery: ContributionQuery;
    runtimeContext: WorkspaceRuntimeContext;
}

export function createBuiltinPluginManifests(host: BuiltinPluginHostContext): PluginManifest[] {
    return [
        taskMgrPlugin,
        createAiAgentPlugin({
            runtimeMode: host.runtimeMode,
            env: host.env,
            isDevelopment: host.isDevelopment,
            storage: host.storage,
            codexBaseUrl: host.codexBaseUrl,
            useMockRuntime: host.useMockRuntime,
            useMockSync: host.useMockSync,
            useMockHistoryProviders: host.useMockHistoryProviders,
            mockSyncKeyFallback: host.mockSyncKeyFallback
        })
    ];
}

export async function createBuiltinPluginRuntime(
    host: BuiltinPluginHostContext,
    config: PluginEnablementConfig
): Promise<BuiltinPluginRuntime> {
    const registry = new PluginRegistry();
    const runtimeContext = createWorkspaceRuntimeContext();
    const manager = new PluginManager(registry, runtimeContext, host.hostContext);

    for (const plugin of createBuiltinPluginManifests(host)) {
        manager.register(plugin);
    }

    await manager.activateEnabledPlugins(config);
    return {
        contributionQuery: registry,
        runtimeContext
    };
}
