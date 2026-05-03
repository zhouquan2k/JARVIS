// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { installGlobalUnhandledErrorFallback } from './installGlobalUnhandledErrorFallback';

describe('installGlobalUnhandledErrorFallback', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('reports unhandled promise rejection messages', () => {
        const reportError = vi.fn();
        const remove = installGlobalUnhandledErrorFallback({ reportError });
        const event = new Event('unhandledrejection') as PromiseRejectionEvent;
        Object.defineProperty(event, 'reason', {
            value: new Error('Rejected backend request'),
            configurable: true
        });

        window.dispatchEvent(event);
        remove();

        expect(reportError).toHaveBeenCalledWith('Rejected backend request');
    });

    it('reports uncaught window error messages', () => {
        const reportError = vi.fn();
        const remove = installGlobalUnhandledErrorFallback({ reportError });

        window.dispatchEvent(new ErrorEvent('error', {
            error: new Error('Uncaught backend request'),
            message: 'Uncaught backend request'
        }));
        remove();

        expect(reportError).toHaveBeenCalledWith('Uncaught backend request');
    });

    it('ignores resize observer loop browser warnings', () => {
        const reportError = vi.fn();
        const remove = installGlobalUnhandledErrorFallback({ reportError });

        window.dispatchEvent(new ErrorEvent('error', {
            message: 'ResizeObserver loop completed with undelivered notifications.'
        }));
        remove();

        expect(reportError).not.toHaveBeenCalled();
    });
});
