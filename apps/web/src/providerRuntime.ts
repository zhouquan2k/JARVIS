import { createProviderRuntime, type IHistoryProvider } from '@packages/core/src';
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

export function createWebHistoryProvider(providerId = 'chatgpt-web'): IHistoryProvider {
  if (useMockRuntime) {
    return createMockHistoryProvider();
  }

  const providerConfig = providerRuntime.getProviderCatalog().find((provider) => provider.id === providerId);
  if (!providerConfig) {
    return createMockHistoryProvider();
  }

  const provider = providerRuntime.getProvider(providerId, { fresh: true }) as Partial<IHistoryProvider>;
  if (typeof provider.getHistoryList !== 'function' || typeof provider.getHistoryDetail !== 'function') {
    return createMockHistoryProvider();
  }

  return provider as IHistoryProvider;
}
