import { HttpApiError } from '@packages/core/src';

export function formatHttpApiError(error: unknown): string {
    if (error instanceof HttpApiError) {
        if (typeof error.message === 'string' && error.message.trim()) {
            return error.message.trim();
        }

        if (error.status !== null) {
            return `HTTP ${error.status}`;
        }

        if (error.isAbortError) {
            return 'Request was aborted.';
        }

        if (error.isNetworkError) {
            return 'Network request failed.';
        }
    }

    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}
