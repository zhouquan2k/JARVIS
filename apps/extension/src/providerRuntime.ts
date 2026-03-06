import { createProviderRuntime, type ProviderRuntime } from '@packages/core/src';
import { BackgroundProxyProvider } from './utils/BackgroundProxyProvider';
import { createMockRuntime } from './testing/createMockRuntime';

function createChannelId(providerId: string): string {
    return `${providerId}-${crypto.randomUUID()}`;
}

export function createExtensionProxyRuntime(): ProviderRuntime {
    return createProviderRuntime({
        runtimeMode: 'extension',
        providerFactory(providerId) {
            return new BackgroundProxyProvider(providerId, { channelId: createChannelId(providerId) });
        }
    });
}

const useMockRuntime = import.meta.env.WXT_E2E === '1';

export const providerRuntime = useMockRuntime ? createMockRuntime() : createExtensionProxyRuntime();
