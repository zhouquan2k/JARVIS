import { createProviderRuntime, type IHistoryProvider, type ProviderRuntime } from '@packages/core/src';
import { BackgroundProxyProvider } from './utils/BackgroundProxyProvider';
import { BackgroundHistoryProxy } from './utils/BackgroundHistoryProxy';
import { createMockHistoryProvider } from './testing/createMockHistoryProvider';

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

export const providerRuntime = createExtensionProxyRuntime();

export function createExtensionHistoryProvider(providerId = 'chatgpt-web'): IHistoryProvider {
    if (useMockRuntime) {
        return createMockHistoryProvider();
    }

    return new BackgroundHistoryProxy(providerId, { channelId: createChannelId(`${providerId}-history`) });
}
