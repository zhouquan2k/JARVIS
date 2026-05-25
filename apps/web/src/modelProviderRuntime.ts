import {
  createAgentRuntime,
  createModelProviderRuntime,
  type ExternalHistoryProviderEntry,
  type ExternalHistoryProviderId,
  type IExternalConversationProvider,
  resolveCodexBaseUrl
} from '@packages/core/src';
import { createMockRuntime } from './testing/createMockRuntime';
import { createMockHistoryProvider } from './testing/createMockHistoryProvider';

const useMockRuntime = import.meta.env.VITE_E2E === '1';

export const modelProviderRuntime = useMockRuntime
  ? createMockRuntime()
  : createModelProviderRuntime({
      runtimeMode: 'web',
      credentials: {
        geminiApiKey: import.meta.env.VITE_LLM_API_KEY
      },
      providerOptionsResolver(providerId) {
        if (providerId !== 'chatgpt-codex') {
          return undefined;
        }

        return {
          baseUrl: resolveCodexBaseUrl({
            env: import.meta.env as Record<string, string | undefined>
          })
        };
      }
    });

export const agentRuntime = createAgentRuntime({
  modelProviderRuntime
});

export function createWebHistoryProvider(
  providerId: Exclude<ExternalHistoryProviderId, 'external-file'> = 'chatgpt-web'
): IExternalConversationProvider {
  if (useMockRuntime) {
    return createMockHistoryProvider(providerId);
  }

  const providerConfig = modelProviderRuntime.getProviderCatalog().find((provider) => provider.id === providerId);
  if (!providerConfig) {
    return createMockHistoryProvider(providerId);
  }

  const provider = modelProviderRuntime.getProvider(providerId, { fresh: true }) as Partial<IExternalConversationProvider>;
  if (typeof provider.getHistoryList !== 'function' || typeof provider.getHistoryDetail !== 'function') {
    return createMockHistoryProvider(providerId);
  }

  return provider as IExternalConversationProvider;
}

export function createWebHistoryProviders(): ExternalHistoryProviderEntry[] {
  return [
    {
      id: 'chatgpt-web',
      label: 'ChatGPT',
      kind: 'history-provider',
      features: {
        historySearch: true,
        historySearchPlaceholder: '搜索 ChatGPT 历史'
      },
      provider: createWebHistoryProvider('chatgpt-web')
    },
    {
      id: 'gemini-web',
      label: 'Gemini',
      kind: 'history-provider',
      features: {
        historySearch: true,
        historySearchPlaceholder: '搜索 Gemini 历史'
      },
      provider: createWebHistoryProvider('gemini-web')
    },
    {
      id: 'external-file',
      label: '外部文件导入',
      kind: 'file-import'
    }
  ];
}
