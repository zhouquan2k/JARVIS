import {
    createAgentRuntime,
    createModelProviderRuntime,
    type ExternalHistoryProviderEntry,
    type ExternalHistoryProviderId,
    type IExternalConversationProvider,
    type ModelProviderRuntime,
    resolveCodexBaseUrl
} from '@packages/core/src';
import { BackgroundProxyProvider } from './utils/BackgroundProxyProvider';
import { BackgroundHistoryProxy } from './utils/BackgroundHistoryProxy';
import { createMockHistoryProvider } from './testing/createMockHistoryProvider';

function createChannelId(providerId: string): string {
    return `${providerId}-${crypto.randomUUID()}`;
}

export function createExtensionProxyRuntime(): ModelProviderRuntime {
    return createModelProviderRuntime({
        runtimeMode: 'extension',
        providerFactory(providerId) {
            if (providerId === 'chatgpt-codex') {
                return undefined;
            }
            return new BackgroundProxyProvider(providerId, { channelId: createChannelId(providerId) });
        },
        providerOptionsResolver(providerId) {
            if (providerId !== 'chatgpt-codex') {
                return undefined;
            }

            return {
                baseUrl: resolveCodexBaseUrl({
                    env: import.meta.env as Record<string, string | undefined>
                })
            };
        }
    });
}

const useMockRuntime = import.meta.env.WXT_E2E === '1';

export const modelProviderRuntime = createExtensionProxyRuntime();

export const agentRuntime = createAgentRuntime({
    modelProviderRuntime
});

export function createExtensionHistoryProvider(
    providerId: Exclude<ExternalHistoryProviderId, 'external-file'> = 'chatgpt-web'
): IExternalConversationProvider {
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
            features: {
                historySearch: true,
                historySearchPlaceholder: '搜索 ChatGPT 历史'
            },
            provider: createExtensionHistoryProvider('chatgpt-web')
        },
        {
            id: 'gemini-web',
            label: 'Gemini',
            kind: 'history-provider',
            features: {
                historySearch: true,
                historySearchPlaceholder: '搜索 Gemini 历史'
            },
            provider: createExtensionHistoryProvider('gemini-web')
        },
        {
            id: 'external-file',
            label: '外部文件导入',
            kind: 'file-import'
        }
    ];
}
