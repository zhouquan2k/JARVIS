import type { CreateBuiltinWorkspaceRuntimeOptions } from '@packages/ui';
import { loadPluginEnablementConfig } from '@packages/ui';
import { resolveCodexBaseUrl } from '@packages/core/src';
import { createDesktop2HostContext } from '../context/createDesktop2HostContext';

export function createDesktop2RuntimeOptions(): CreateBuiltinWorkspaceRuntimeOptions {
    const runtimeEnv = window.chatprismDesktop?.runtimeEnv;
    console.log('[desktop2] runtimeEnv.geminiApiKey present:', !!runtimeEnv?.geminiApiKey);
    const env: Record<string, string | undefined> = {
        ...(import.meta.env as Record<string, string | undefined>),
        ...(runtimeEnv?.domChatGptUrl ? { CHATPRISM_DOM_CHATGPT_URL: runtimeEnv.domChatGptUrl } : {}),
        ...(runtimeEnv?.domGeminiUrl ? { CHATPRISM_DOM_GEMINI_URL: runtimeEnv.domGeminiUrl } : {}),
        ...(runtimeEnv?.geminiApiKey ? { VITE_LLM_API_KEY: runtimeEnv.geminiApiKey } : {})
    };
    return {
        hostContext: createDesktop2HostContext(),
        runtimeMode: 'desktop',
        env,
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
            defaultEnabledPluginIds: ['ai-agent', 'task-mgr', 'bilibili-import']
        })
    };
}
