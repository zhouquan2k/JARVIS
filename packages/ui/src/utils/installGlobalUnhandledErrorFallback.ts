function resolveErrorMessage(error: unknown): string | null {
    if (error instanceof Error) {
        return error.message.trim() || error.name.trim() || null;
    }

    if (typeof error === 'string') {
        const normalized = error.trim();
        return normalized || null;
    }

    if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as { message: unknown }).message;
        if (typeof message === 'string' && message.trim()) {
            return message.trim();
        }
    }

    return null;
}

function shouldIgnoreWindowError(message: string, event: ErrorEvent): boolean {
    const normalized = message.trim();
    if (!normalized) {
        return false;
    }

    if (
        normalized === 'ResizeObserver loop completed with undelivered notifications.'
        || normalized === 'ResizeObserver loop limit exceeded'
    ) {
        return true;
    }

    if (isIgnorableMilkdownContextError(normalized)) {
        return true;
    }

    return event.filename === '' && event.lineno === 0 && event.colno === 0 && normalized.startsWith('ResizeObserver');
}

/**
 * Crepe/Milkdown schedules a requestAnimationFrame inside its editor `onMount`
 * that dispatches a transaction. When the editor is torn down during navigation
 * before that rAF fires (e.g. a create that gets aborted), the detached callback
 * runs against the destroyed editor and throws `Context "<slice>" not found`.
 * This is a benign teardown-race artifact that cannot be caught locally (the rAF
 * is not part of any awaited promise), so we treat it as ignorable noise here.
 */
function isIgnorableMilkdownContextError(message: string): boolean {
    return /Context "[^"]*" not found/.test(message);
}

export function installGlobalUnhandledErrorFallback(options: {
    reportError: (message: string) => void;
}): () => void {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
        const message = resolveErrorMessage(event.reason);
        if (!message) {
            return;
        }

        if (isIgnorableMilkdownContextError(message.trim())) {
            // Suppress the default "Uncaught (in promise)" console logging too.
            event.preventDefault();
            return;
        }

        options.reportError(message);
    };

    const handleWindowError = (event: ErrorEvent) => {
        const message = resolveErrorMessage(event.error) || resolveErrorMessage(event.message);
        if (!message) {
            return;
        }

        if (shouldIgnoreWindowError(message, event)) {
            // Suppress the default "Uncaught" console logging for benign races.
            event.preventDefault();
            return;
        }

        options.reportError(message);
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleWindowError);

    return () => {
        window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        window.removeEventListener('error', handleWindowError);
    };
}
