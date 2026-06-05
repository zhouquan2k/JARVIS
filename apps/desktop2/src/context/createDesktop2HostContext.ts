import type {
    BrowserAutomationCapability,
    ControlledPageCapability,
    HostCapabilityKey,
    IHostContext,
    ProviderLoginCapability
} from '@packages/core';

function getCapabilityMap(): Map<HostCapabilityKey, unknown> {
    const capabilities = new Map<HostCapabilityKey, unknown>();

    if (typeof localStorage !== 'undefined') {
        capabilities.set('storage', localStorage);
    }

    if (typeof fetch === 'function') {
        capabilities.set('http-client', fetch);
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
