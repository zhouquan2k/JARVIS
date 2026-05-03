import { HttpApiError, type HttpApiErrorSource } from '../../interfaces/HttpApiError';

export interface HttpApiClientOptions {
    baseUrl?: string;
    fetchImpl?: typeof fetch;
    headers?: Record<string, string>;
    source?: HttpApiErrorSource;
}

type ErrorPayload = {
    error?: unknown;
    code?: unknown;
    details?: unknown;
};

function joinUrl(baseUrl: string, path: string): string {
    if (!path) {
        return baseUrl;
    }

    if (/^https?:\/\//.test(path)) {
        return path;
    }

    return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJsonResponse(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text.trim()) {
        return null;
    }

    try {
        return JSON.parse(text) as unknown;
    } catch (error) {
        throw new HttpApiError({
            message: 'Response body is not valid JSON.',
            status: response.status,
            isNetworkError: false,
            isAbortError: false,
            details: { rawBody: text },
            cause: error
        });
    }
}

function buildErrorMessage(status: number, payload: unknown): string {
    if (isRecord(payload) && typeof payload.error === 'string' && payload.error.trim()) {
        return payload.error.trim();
    }

    return `HTTP ${status}`;
}

function buildErrorCode(payload: unknown): string | undefined {
    if (isRecord(payload) && typeof payload.code === 'string' && payload.code.trim()) {
        return payload.code.trim();
    }

    return undefined;
}

export class HttpApiClient {
    private readonly baseUrl: string;
    private readonly fetchImpl: typeof fetch;
    private readonly headers: Record<string, string>;
    private readonly source: HttpApiErrorSource;

    constructor(options: HttpApiClientOptions = {}) {
        if (!options.fetchImpl && typeof fetch === 'undefined') {
            throw new Error('The current environment does not support fetch.');
        }

        this.baseUrl = (options.baseUrl?.trim() || '').replace(/\/+$/, '');
        this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
        this.headers = options.headers ?? {};
        this.source = options.source ?? 'unknown';
    }

    async getJson<T>(path: string, init: RequestInit = {}): Promise<T> {
        const result = await this.request<T>(path, {
            ...init,
            method: init.method ?? 'GET'
        });
        return result.data;
    }

    async postJson<T>(path: string, body: unknown, init: RequestInit = {}): Promise<T> {
        const result = await this.request<T>(path, {
            ...init,
            method: init.method ?? 'POST',
            headers: {
                'content-type': 'application/json',
                ...(init.headers ?? {})
            },
            body: JSON.stringify(body)
        });
        return result.data;
    }

    async request<T>(path: string, init: RequestInit): Promise<{ data: T; response: Response }> {
        const url = joinUrl(this.baseUrl, path);
        let response: Response;

        try {
            response = await this.fetchImpl(url, {
                ...init,
                headers: {
                    ...this.headers,
                    ...(init.headers ?? {})
                }
            });
        } catch (error) {
            if (error instanceof HttpApiError) {
                throw error;
            }

            const isAbortError = error instanceof Error && error.name === 'AbortError';
            throw new HttpApiError({
                message: error instanceof Error ? error.message : 'Network request failed.',
                status: null,
                source: this.source,
                endpoint: url,
                isNetworkError: true,
                isAbortError,
                cause: error
            });
        }

        const payload = await readJsonResponse(response).catch((error) => {
            if (error instanceof HttpApiError) {
                error.source = this.source;
                error.endpoint = url;
            }
            throw error;
        });

        if (!response.ok) {
            throw new HttpApiError({
                message: buildErrorMessage(response.status, payload),
                status: response.status,
                code: buildErrorCode(payload),
                source: this.source,
                endpoint: url,
                details: isRecord(payload) ? (payload as ErrorPayload).details : payload
            });
        }

        return {
            data: payload as T,
            response
        };
    }
}
