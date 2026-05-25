export interface ProviderRequestClient {
    fetch(input: string, init?: RequestInit): Promise<Response>;
}

export interface ProviderCookieStore {
    get(options: { url: string; name: string }): Promise<{ value?: string } | null>;
}

export interface ChatGPTWebProviderOptions {
    requestClient?: ProviderRequestClient;
    cookieStore?: ProviderCookieStore;
    userAgent?: string;
}

export interface ChatGPTCodexProviderOptions {
    baseUrl?: string;
    requestClient?: ProviderRequestClient;
}
