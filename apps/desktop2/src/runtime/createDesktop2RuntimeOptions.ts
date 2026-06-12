import type { CreateBuiltinWorkspaceRuntimeOptions } from '@packages/ui';
import { loadPluginEnablementConfig } from '@packages/ui';
import { resolveCodexBaseUrl } from '@packages/core/src';
import { createDesktop2HostContext } from '../context/createDesktop2HostContext';

// Desktop renderer is always served same-origin with the API (Vite proxy in dev,
// server static hosting in prod), so all API base URLs default to same-origin
// relative paths. This keeps requests same-origin and avoids cross-origin CORS.
const RELATIVE_API_BASE_URLS: Record<string, string> = {
    CHATPRISM_CONTEXT_BASE_URL: '/api/context',
    CHATPRISM_SYNC_BASE_URL: '/api/sync',
    CHATPRISM_CODEX_BASE_URL: '/api/codex',
    CHATPRISM_PROVIDER_CONFIG_BASE_URL: '/api/provider-configs'
};

export function createDesktop2RuntimeOptions(): CreateBuiltinWorkspaceRuntimeOptions {
    const runtimeEnv = window.chatprismDesktop?.runtimeEnv;
    console.log('[desktop2] runtimeEnv.geminiApiKey present:', !!runtimeEnv?.geminiApiKey);
    const env: Record<string, string | undefined> = {
        ...(import.meta.env as Record<string, string | undefined>),
        ...(runtimeEnv?.domChatGptUrl ? { CHATPRISM_DOM_CHATGPT_URL: runtimeEnv.domChatGptUrl } : {}),
        ...(runtimeEnv?.domGeminiUrl ? { CHATPRISM_DOM_GEMINI_URL: runtimeEnv.domGeminiUrl } : {}),
        ...(runtimeEnv?.geminiApiKey ? { VITE_LLM_API_KEY: runtimeEnv.geminiApiKey } : {})
    };
    // Fill same-origin relative defaults for any API base URL not explicitly configured.
    for (const [key, value] of Object.entries(RELATIVE_API_BASE_URLS)) {
        if (!env[key]) {
            env[key] = value;
        }
    }
    return {
        hostContext: createDesktop2HostContext(),
        runtimeMode: 'desktop',
        env,
        isDevelopment: import.meta.env.DEV,
        storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
        codexBaseUrl: resolveCodexBaseUrl({ env }),
        useMockRuntime: import.meta.env.VITE_DESKTOP_USE_MOCK_RUNTIME === '1',
        useMockSync: import.meta.env.VITE_USE_MOCK_SYNC === '1' || import.meta.env.VITE_E2E === '1',
        mockSyncKeyFallback: 'desktop-e2e',
        pluginEnablement: loadPluginEnablementConfig({
            storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
            defaultEnabledPluginIds: ['ai-agent', 'task-mgr', 'bilibili-import']
        })
    };
}
