import type { CreateBuiltinWorkspaceRuntimeOptions } from '@packages/ui';
import { loadPluginEnablementConfig } from '@packages/ui';
import { resolveCodexBaseUrl } from '@packages/core/src';
import { createDesktop2HostContext } from '../context/createDesktop2HostContext';

export function createDesktop2RuntimeOptions(): CreateBuiltinWorkspaceRuntimeOptions {
    return {
        hostContext: createDesktop2HostContext(),
        runtimeMode: 'desktop',
        env: import.meta.env as Record<string, string | undefined>,
        isDevelopment: import.meta.env.DEV,
        storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
        codexBaseUrl: resolveCodexBaseUrl({
            env: import.meta.env as Record<string, string | undefined>
        }),
        useMockRuntime: import.meta.env.VITE_DESKTOP_USE_MOCK_RUNTIME === '1',
        useMockSync: import.meta.env.VITE_USE_MOCK_SYNC === '1' || import.meta.env.VITE_E2E === '1',
        mockSyncKeyFallback: 'desktop-e2e',
        pluginEnablement: loadPluginEnablementConfig({
            storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
            defaultEnabledPluginIds: ['ai-agent', 'task-mgr']
        })
    };
}
