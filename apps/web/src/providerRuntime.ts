import { createProviderRuntime } from '@packages/core/src/runtime/createProviderRuntime';

export const providerRuntime = createProviderRuntime({
  runtimeMode: 'web',
  credentials: {
    geminiApiKey: import.meta.env.VITE_LLM_API_KEY
  }
});
