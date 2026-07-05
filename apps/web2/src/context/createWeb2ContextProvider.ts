import { resolveContextBaseUrl, type HttpContextProviderOptions, type ResolveContextBaseUrlOptions } from '@packages/ui';
import { Web2ContextProvider } from './Web2ContextProvider';

export interface CreateWeb2ContextProviderOptions extends Pick<HttpContextProviderOptions, 'fetchImpl' | 'baseUrl'>, ResolveContextBaseUrlOptions {}

export function createWeb2ContextProvider(options: CreateWeb2ContextProviderOptions = {}) {
  return new Web2ContextProvider({
    baseUrl: options.baseUrl ?? resolveContextBaseUrl(options.env),
    fetchImpl: options.fetchImpl
  });
}

export { resolveContextBaseUrl };
