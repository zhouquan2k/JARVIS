import { HttpContextProvider, resolveContextBaseUrl, type HttpContextProviderOptions, type ResolveContextBaseUrlOptions } from '@packages/ui';

export interface CreateWeb2ContextProviderOptions extends Pick<HttpContextProviderOptions, 'fetchImpl' | 'baseUrl'>, ResolveContextBaseUrlOptions {}

export function createWeb2ContextProvider(options: CreateWeb2ContextProviderOptions = {}) {
  return new HttpContextProvider({
    baseUrl: options.baseUrl ?? resolveContextBaseUrl(options.env),
    fetchImpl: options.fetchImpl
  });
}

export { resolveContextBaseUrl };
