import {
    HttpContextProvider,
    resolveContextBaseUrl,
    type HttpContextProviderOptions,
    type ResolveContextBaseUrlOptions
} from '@packages/ui';

export interface CreateDesktop2ContextProviderOptions
    extends Pick<HttpContextProviderOptions, 'fetchImpl' | 'baseUrl'>,
        ResolveContextBaseUrlOptions {}

export function createDesktop2ContextProvider(
    options: CreateDesktop2ContextProviderOptions = {}
) {
    const runtimeBaseUrl = typeof window !== 'undefined'
        ? window.chatprismDesktop?.runtimeEnv?.contextBaseUrl?.trim()
        : undefined;
    return new HttpContextProvider({
        baseUrl: options.baseUrl ?? runtimeBaseUrl ?? resolveContextBaseUrl(options.env),
        fetchImpl: options.fetchImpl
    });
}

export { resolveContextBaseUrl };
