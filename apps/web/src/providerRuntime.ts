import {
  createAgentRuntime,
  createProviderRuntime,
  type ExternalHistoryProviderEntry,
  type ExternalHistoryProviderId,
  type IHistoryProvider
} from '@packages/core/src';
import { createMockRuntime } from './testing/createMockRuntime';
import { createMockHistoryProvider } from './testing/createMockHistoryProvider';

const useMockRuntime = import.meta.env.VITE_E2E === '1';

export const providerRuntime = useMockRuntime
  ? createMockRuntime()
  : createProviderRuntime({
      runtimeMode: 'web',
      credentials: {
        geminiApiKey: import.meta.env.VITE_LLM_API_KEY
      }
    });

export const agentRuntime = createAgentRuntime({
  providerRuntime
});

export function createWebHistoryProvider(providerId: Exclude<ExternalHistoryProviderId, 'external-file'> = 'chatgpt-web'): IHistoryProvider {
  if (useMockRuntime) {
    return createMockHistoryProvider(providerId);
  }

  const providerConfig = providerRuntime.getProviderCatalog().find((provider) => provider.id === providerId);
  if (!providerConfig) {
    return createMockHistoryProvider(providerId);
  }

  const provider = providerRuntime.getProvider(providerId, { fresh: true }) as Partial<IHistoryProvider>;
  if (typeof provider.getHistoryList !== 'function' || typeof provider.getHistoryDetail !== 'function') {
    return createMockHistoryProvider(providerId);
  }

  return provider as IHistoryProvider;
}

export function createWebHistoryProviders(): ExternalHistoryProviderEntry[] {
  return [
    {
      id: 'chatgpt-web',
      label: 'ChatGPT',
      kind: 'history-provider',
      provider: createWebHistoryProvider('chatgpt-web')
    },
    {
      id: 'gemini-web',
      label: 'Gemini',
      kind: 'history-provider',
      provider: createWebHistoryProvider('gemini-web')
    },
    {
      id: 'external-file',
      label: '外部文件导入',
      kind: 'file-import'
    }
  ];
}
