import {
  HttpContextProvider,
  resolveContextBaseUrl,
  type HttpContextProviderOptions,
  type ResolveContextBaseUrlOptions
} from '@packages/core/src';

export interface CreateExtensionContextProviderOptions extends Pick<HttpContextProviderOptions, 'fetchImpl' | 'baseUrl'>, ResolveContextBaseUrlOptions {}

export function createExtensionContextProvider(options: CreateExtensionContextProviderOptions = {}) {
  return new HttpContextProvider({
    baseUrl: options.baseUrl ?? resolveContextBaseUrl(options.env),
    fetchImpl: options.fetchImpl
  });
}
