import { createProviderRuntime } from '@packages/core/src/runtime/createProviderRuntime';
import { createMockRuntime } from './testing/createMockRuntime';

const useMockRuntime = import.meta.env.VITE_E2E === '1';

export const providerRuntime = useMockRuntime
  ? createMockRuntime()
  : createProviderRuntime({
      runtimeMode: 'web',
      credentials: {
        geminiApiKey: import.meta.env.VITE_LLM_API_KEY
      }
    });
