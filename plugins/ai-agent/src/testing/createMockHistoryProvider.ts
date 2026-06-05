import {
    ExternalHistoryError,
    type Conversation,
    type ConversationHistorySummary,
    type ExternalHistoryProviderId,
    type HistoryListQueryOptions,
    type IExternalConversationProvider
} from '../internal';

const MOCK_SUMMARIES: Record<Exclude<ExternalHistoryProviderId, 'external-file'>, ConversationHistorySummary[]> = {
    'chatgpt-web': [
        {
            id: 'external-alpha',
            title: 'Alpha Research Notes',
            updatedAt: 1_710_000_000_000,
            origin: 'chatgpt-web'
        }
    ],
    'gemini-web': [
        {
            id: 'gemini-alpha',
            title: 'Gemini Sprint Review',
            updatedAt: 1_710_100_000_000,
            origin: 'gemini-web'
        }
    ]
};

const MOCK_DETAILS: Record<string, Conversation> = {
    'external-alpha': {
        id: 'preview-alpha',
        title: 'Alpha Research Notes',
        backendId: 'external-alpha',
        externalId: 'external-alpha',
        origin: 'chatgpt-web',
        updatedAt: 1_710_000_000_000,
        messages: [
            { id: 'alpha-u1', role: 'user', content: '总结一下 Alpha 项目的风险。' },
            { id: 'alpha-a1', role: 'assistant', content: 'Alpha 项目的主要风险包括范围失控、交付节奏不稳定和需求验证不足。' }
        ]
    },
    'gemini-alpha': {
        id: 'preview-gemini-alpha',
        title: 'Gemini Sprint Review',
        backendId: 'gemini-alpha',
        externalId: 'gemini-alpha',
        origin: 'gemini-web',
        updatedAt: 1_710_100_000_000,
        messages: [
            { id: 'ga-u1', role: 'user', content: '整理一下这周的 Gemini incident 迭代结论。' },
            { id: 'ga-a1', role: 'assistant', content: '本周重点是规则远程化、标签页桥接和错误规范化。' }
        ]
    }
};

export function createMockHistoryProvider(
    providerId: Exclude<ExternalHistoryProviderId, 'external-file'> = 'chatgpt-web'
): IExternalConversationProvider {
    const allSummaries = MOCK_SUMMARIES[providerId] || [];

    return {
        id: providerId,
        async getHistoryList(options: HistoryListQueryOptions = {}) {
            const normalizedQuery = options.query?.trim().toLowerCase() || '';
            if (!normalizedQuery) {
                return allSummaries.map((item) => ({ ...item }));
            }

            return allSummaries
                .filter((item) => item.title.toLowerCase().includes(normalizedQuery))
                .map((item) => ({ ...item }));
        },
        async getHistoryDetail(externalId: string) {
            if (providerId === 'gemini-web' && externalId === 'gemini-alpha') {
                throw new ExternalHistoryError('SELECTOR_MISMATCH', 'Gemini 页面结构已变化，请稍后再试。', {
                    providerId: 'gemini-web'
                });
            }

            const detail = MOCK_DETAILS[externalId];
            if (!detail || detail.origin !== providerId) {
                throw new Error(`Mock history conversation '${externalId}' not found`);
            }

            return {
                ...detail,
                messages: detail.messages.map((message) => ({ ...message }))
            };
        }
    };
}
