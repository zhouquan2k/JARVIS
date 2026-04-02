import {
    createAgentRuntime,
    createProviderRuntime,
    type ExternalHistoryProviderEntry,
    type ExternalHistoryProviderId,
    type IHistoryProvider,
    type ProviderRuntime
} from '@packages/core/src';
import { DesktopHistoryProxy } from './utils/DesktopHistoryProxy';
import { DesktopProxyProvider } from './utils/DesktopProxyProvider';
import { createMockRuntime } from './testing/createMockRuntime';

function createChannelId(providerId: string): string {
    return `${providerId}-${crypto.randomUUID()}`;
}

export function createDesktopProxyRuntime(): ProviderRuntime {
    return createProviderRuntime({
        runtimeMode: 'desktop',
        providerFactory(providerId) {
            return new DesktopProxyProvider(providerId, { channelId: createChannelId(providerId) });
        }
    });
}

const useMockRuntime = import.meta.env.VITE_DESKTOP_USE_MOCK_RUNTIME === '1';

export const providerRuntime = useMockRuntime
    ? createMockRuntime()
    : createDesktopProxyRuntime();

export const agentRuntime = createAgentRuntime({
    providerRuntime
});

export function createDesktopHistoryProvider(
    providerId: Exclude<ExternalHistoryProviderId, 'external-file'> = 'chatgpt-web'
): IHistoryProvider {
    return new DesktopHistoryProxy(providerId, { channelId: createChannelId(`${providerId}-history`) });
}

export function createDesktopHistoryProviders(): ExternalHistoryProviderEntry[] {
    return [
        {
            id: 'chatgpt-web',
            label: 'ChatGPT',
            kind: 'history-provider',
            features: {
                historySearch: true,
                historySearchPlaceholder: '搜索 ChatGPT 历史'
            },
            provider: createDesktopHistoryProvider('chatgpt-web')
        },
        {
            id: 'gemini-web',
            label: 'Gemini',
            kind: 'history-provider',
            features: {
                historySearch: true,
                historySearchPlaceholder: '搜索 Gemini 历史'
            },
            provider: createDesktopHistoryProvider('gemini-web')
        },
        {
            id: 'external-file',
            label: '外部文件导入',
            kind: 'file-import'
        }
    ];
}
