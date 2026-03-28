import {
    createAgentRuntime,
    createProviderRuntime,
    type ExternalHistoryProviderEntry,
    type ExternalHistoryProviderId,
    type IHistoryProvider,
    type ProviderRuntime
} from '@packages/core/src';
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

export const agentRuntime = createAgentRuntime({
    providerRuntime
});

export function createExtensionHistoryProvider(providerId: Exclude<ExternalHistoryProviderId, 'external-file'> = 'chatgpt-web'): IHistoryProvider {
    if (useMockRuntime) {
        return createMockHistoryProvider(providerId);
    }

    return new BackgroundHistoryProxy(providerId, { channelId: createChannelId(`${providerId}-history`) });
}

export function createExtensionHistoryProviders(): ExternalHistoryProviderEntry[] {
    return [
        {
            id: 'chatgpt-web',
            label: 'ChatGPT',
            kind: 'history-provider',
            provider: createExtensionHistoryProvider('chatgpt-web')
        },
        {
            id: 'gemini-web',
            label: 'Gemini',
            kind: 'history-provider',
            provider: createExtensionHistoryProvider('gemini-web')
        },
        {
            id: 'external-file',
            label: '外部文件导入',
            kind: 'file-import'
        }
    ];
}
