import type { BrowserAutomationCapability, HostCapabilityKey, IHostContext } from '@packages/core';
import { GeminiHistoryPageBridge } from './GeminiHistoryPageBridge';
import { getProviderSession } from './sessionManager';
import type { ControlledPageManager } from './controlledPageManager';

class MemoryConfigStorage {
    private readonly data = new Map<string, string>();

    async get(key: string): Promise<string | null> {
        return this.data.get(key) ?? null;
    }

    async set(key: string, value: string): Promise<void> {
        this.data.set(key, value);
    }
}

export function createDesktopMainHostContext(options: {
    controlledPageManager: ControlledPageManager;
    preloadPath: string;
}): IHostContext {
    const capabilities = new Map<HostCapabilityKey, unknown>();

    capabilities.set('storage', new MemoryConfigStorage());
    const geminiPageBridge = new GeminiHistoryPageBridge({
        controlledPageManager: options.controlledPageManager,
        preloadPath: options.preloadPath
    });
    capabilities.set('browser-tabs', {
        probeHistoryListReady(config: Record<string, unknown>, opts?: { forceReload?: boolean }) {
            return geminiPageBridge.probeHistoryListReady(config, opts);
        }
    });
    capabilities.set('browser-automation', {
        async fetch(request: Parameters<BrowserAutomationCapability['fetch']>[0]) {
            const session = getProviderSession(request.providerId);
            const response = await session.fetch(request.input, request.init);
            return {
                status: response.status,
                statusText: response.statusText,
                headers: Array.from(response.headers.entries()),
                bodyText: await response.text()
            };
        },
        async getCookie(
            providerId: string,
            options: Parameters<BrowserAutomationCapability['getCookie']>[1]
        ) {
            const session = getProviderSession(providerId);
            const cookies = await session.cookies.get(options);
            const matched = cookies[0];
            return matched ? { value: matched.value } : null;
        }
    } satisfies BrowserAutomationCapability);

    return {
        environment: {
            platform: 'desktop'
        },
        hasCapability(capability) {
            return capabilities.has(capability);
        },
        getCapability<T>(capability: HostCapabilityKey): T | null {
            return (capabilities.get(capability) as T | undefined) ?? null;
        }
    };
}
