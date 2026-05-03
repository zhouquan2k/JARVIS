export type HttpApiErrorSource =
    | 'sync'
    | 'context'
    | 'provider-config'
    | 'unknown';

export interface HttpApiErrorOptions {
    message: string;
    status?: number | null;
    code?: string;
    source?: HttpApiErrorSource;
    endpoint?: string;
    isNetworkError?: boolean;
    isAbortError?: boolean;
    details?: unknown;
    cause?: unknown;
}

export class HttpApiError extends Error {
    status: number | null;
    code?: string;
    source: HttpApiErrorSource;
    endpoint?: string;
    isNetworkError: boolean;
    isAbortError: boolean;
    details?: unknown;

    constructor(options: HttpApiErrorOptions) {
        super(options.message);
        this.name = 'HttpApiError';
        this.status = options.status ?? null;
        this.code = options.code;
        this.source = options.source ?? 'unknown';
        this.endpoint = options.endpoint;
        this.isNetworkError = options.isNetworkError === true;
        this.isAbortError = options.isAbortError === true;
        this.details = options.details;

        if (!('cause' in this) && options.cause !== undefined) {
            Object.defineProperty(this, 'cause', {
                configurable: true,
                enumerable: false,
                value: options.cause,
                writable: true
            });
        }
    }
}
