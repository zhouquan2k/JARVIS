import type { HostCapabilityKey, IHostContext } from '@packages/core';
import { resolveContextBaseUrl, type ResolveContextBaseUrlOptions } from '@packages/core/config';

function getCapabilityMap(): Map<HostCapabilityKey, unknown> {
    const capabilities = new Map<HostCapabilityKey, unknown>();

    if (typeof localStorage !== 'undefined') {
        capabilities.set('storage', localStorage);
    }

    if (typeof fetch === 'function') {
        capabilities.set('http-client', fetch);
    }

    return capabilities;
}

export function createWeb2HostContext(options: ResolveContextBaseUrlOptions = {}): IHostContext {
    const capabilities = getCapabilityMap();

    return {
        environment: {
            platform: 'web',
            contextBaseUrl: resolveContextBaseUrl(options.env)
        },
        hasCapability(capability) {
            return capabilities.has(capability);
        },
        getCapability<T>(capability: HostCapabilityKey): T | null {
            return (capabilities.get(capability) as T | undefined) ?? null;
        }
    };
}
