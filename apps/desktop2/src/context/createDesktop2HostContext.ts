import type {
    BrowserAutomationCapability,
    ControlledPageCapability,
    HostCapabilityKey,
    IHostContext,
    ProviderLoginCapability
} from '@packages/core';
import type { DesktopFetchResponse } from '../../shared/fetchBridge';

function resolveBrowserFetch(): typeof fetch | undefined {
    if (typeof globalThis.fetch !== 'function') {
        return undefined;
    }

    return globalThis.fetch.bind(globalThis);
}

function resolveDesktopFetchInput(input: RequestInfo | URL): RequestInfo | URL {
    if (typeof window === 'undefined') {
        return input;
    }

    if (input instanceof Request) {
        return input;
    }

    const raw = typeof input === 'string' ? input : input.toString();
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw)) {
        return raw;
    }

    return new URL(raw, window.location.href).toString();
}

function createDesktopFetch(): typeof fetch | undefined {
    if (typeof window === 'undefined') {
        return undefined;
    }

    const bridge = window.jarvisFetchBridge ?? window.chatprismDesktop?.fetch;
    if (!bridge) {
        return undefined;
    }

    return async (input: RequestInfo | URL, init?: RequestInit) => {
        const resolvedInput = resolveDesktopFetchInput(input);
        const response = await bridge(resolvedInput, init) as DesktopFetchResponse;
        return new Response(response.bodyText, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
        });
    };
}

function getCapabilityMap(): Map<HostCapabilityKey, unknown> {
    const capabilities = new Map<HostCapabilityKey, unknown>();

    if (typeof localStorage !== 'undefined') {
        capabilities.set('storage', localStorage);
    }

    const desktopFetch = typeof window !== 'undefined'
        ? (window.jarvisFetch ?? createDesktopFetch())
        : undefined;
    if (typeof desktopFetch === 'function') {
        window.jarvisFetch = desktopFetch;
        capabilities.set('http-client', desktopFetch);
    } else {
        const browserFetch = resolveBrowserFetch();
        if (browserFetch) {
            capabilities.set('http-client', browserFetch);
        }
    }

    if (typeof window !== 'undefined' && window.chatprismDesktop) {
        capabilities.set('message-port', window.chatprismDesktop);
        capabilities.set('browser-automation', {
            fetch(input: Parameters<BrowserAutomationCapability['fetch']>[0]) {
                return window.chatprismDesktop!.browserAutomationFetch(input);
            },
            getCookie(providerId: string, options: Parameters<BrowserAutomationCapability['getCookie']>[1]) {
                return window.chatprismDesktop!.browserAutomationGetCookie({
                    providerId,
                    ...options
                });
            }
        } satisfies BrowserAutomationCapability);
        capabilities.set('controlled-page', {
            openControlledPage(input: Parameters<ControlledPageCapability['openControlledPage']>[0]) {
                return window.chatprismDesktop!.openControlledPage(input);
            },
            evaluateInPage(input: Parameters<ControlledPageCapability['evaluateInPage']>[0]) {
                return window.chatprismDesktop!.evaluateInControlledPage(input);
            },
            subscribeControlledPageEvent(providerId, listener) {
                return window.chatprismDesktop!.subscribeControlledPageEvent((event) => {
                    if (event.providerId === providerId) {
                        listener(event);
                    }
                });
            }
        } satisfies ControlledPageCapability);
        capabilities.set('provider-login', {
            openProviderLogin(providerId: string) {
                return window.chatprismDesktop!.openProviderLoginWindow(providerId);
            },
            subscribeProviderLoginOpened(listener: Parameters<ProviderLoginCapability['subscribeProviderLoginOpened']>[0]) {
                return window.chatprismDesktop!.onProviderLoginWindowOpened(listener);
            },
            subscribeProviderLoginCompleted(listener: Parameters<ProviderLoginCapability['subscribeProviderLoginCompleted']>[0]) {
                return window.chatprismDesktop!.onProviderLoginCompleted(listener);
            },
            subscribeProviderLoginClosed(listener: Parameters<ProviderLoginCapability['subscribeProviderLoginClosed']>[0]) {
                return window.chatprismDesktop!.onProviderLoginWindowClosed(listener);
            }
        } satisfies ProviderLoginCapability);
    }

    return capabilities;
}

export function createDesktop2HostContext(): IHostContext {
    const capabilities = getCapabilityMap();

    return {
        environment: {
            platform: 'desktop',
            contextBaseUrl: window.chatprismDesktop?.runtimeEnv?.contextBaseUrl?.trim() || undefined
        },
        hasCapability(capability) {
            return capabilities.has(capability);
        },
        getCapability<T>(capability: HostCapabilityKey): T | null {
            return (capabilities.get(capability) as T | undefined) ?? null;
        }
    };
}
