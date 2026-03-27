import { resolveSyncBaseUrl } from '@packages/core/src';
import { HttpContextProvider, DEFAULT_CONTEXT_BASE_URL, type HttpContextProviderOptions } from './HttpContextProvider';

type AppEnv = Record<string, string | undefined>;

function resolveContextBaseUrl(env?: AppEnv): string {
  const explicit = env?.VITE_CONTEXT_BASE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, '');
  }

  const syncBaseUrl = resolveSyncBaseUrl({ env });
  if (syncBaseUrl.endsWith('/api/sync')) {
    return `${syncBaseUrl.slice(0, -'/api/sync'.length)}/api/context`;
  }

  return DEFAULT_CONTEXT_BASE_URL;
}

export interface CreateWebContextProviderOptions extends Pick<HttpContextProviderOptions, 'fetchImpl' | 'baseUrl'> {
  env?: AppEnv;
}

export function createWebContextProvider(options: CreateWebContextProviderOptions = {}) {
  return new HttpContextProvider({
    baseUrl: options.baseUrl ?? resolveContextBaseUrl(options.env),
    fetchImpl: options.fetchImpl
  });
}

export { resolveContextBaseUrl };
