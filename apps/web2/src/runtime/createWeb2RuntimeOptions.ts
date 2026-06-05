import type { CreateBuiltinWorkspaceRuntimeOptions } from '@packages/ui';
import { loadPluginEnablementConfig } from '@packages/ui';
import { resolveCodexBaseUrl } from '@packages/core';
import { createWeb2HostContext } from '../context/createWeb2HostContext';

export function createWeb2RuntimeOptions(): CreateBuiltinWorkspaceRuntimeOptions {
    return {
        hostContext: createWeb2HostContext({
            env: import.meta.env as Record<string, string | undefined>
        }),
        runtimeMode: 'web',
        env: import.meta.env as Record<string, string | undefined>,
        isDevelopment: import.meta.env.DEV,
        storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
        codexBaseUrl: resolveCodexBaseUrl({
            env: import.meta.env as Record<string, string | undefined>
        }),
        useMockRuntime: import.meta.env.VITE_E2E === '1',
        useMockSync: import.meta.env.VITE_USE_MOCK_SYNC === '1' || import.meta.env.VITE_E2E === '1',
        useMockHistoryProviders: import.meta.env.VITE_E2E === '1',
        pluginEnablement: loadPluginEnablementConfig({
            storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
            defaultEnabledPluginIds: ['ai-agent', 'task-mgr'], // 'ai-agent', 'task-mgr'
            fallbackToDefaultEnabled: false
        })
    };
}
