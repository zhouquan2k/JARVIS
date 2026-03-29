import {
  HttpContextProvider,
  resolveContextBaseUrl,
  type HttpContextProviderOptions,
  type ResolveContextBaseUrlOptions
} from '@packages/core/src';

export interface CreateWebContextProviderOptions extends Pick<HttpContextProviderOptions, 'fetchImpl' | 'baseUrl'>, ResolveContextBaseUrlOptions {}

export function createWebContextProvider(options: CreateWebContextProviderOptions = {}) {
  return new HttpContextProvider({
    baseUrl: options.baseUrl ?? resolveContextBaseUrl(options.env),
    fetchImpl: options.fetchImpl
  });
}

export { resolveContextBaseUrl };
