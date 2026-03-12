import { ExternalHistoryError, type Conversation, type ConversationHistorySummary, type ExternalHistoryProviderId, type IHistoryProvider } from '@packages/core/src';

const MOCK_SUMMARIES: Record<Exclude<ExternalHistoryProviderId, 'external-file'>, ConversationHistorySummary[]> = {
    'chatgpt-web': [
        {
            id: 'external-alpha',
            title: 'Alpha Research Notes',
            updatedAt: 1_710_000_000_000,
            origin: 'chatgpt-web'
        },
        {
            id: 'external-beta',
            title: 'Beta Planning Session',
            updatedAt: 1_709_900_000_000,
            origin: 'chatgpt-web'
        }
    ],
    'gemini-web': [
        {
            id: 'gemini-alpha',
            title: 'Gemini Sprint Review',
            updatedAt: 1_710_100_000_000,
            origin: 'gemini-web'
        },
        {
            id: 'gemini-beta',
            title: 'Gemini Incident Draft',
            updatedAt: 1_710_050_000_000,
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
    'external-beta': {
        id: 'preview-beta',
        title: 'Beta Planning Session',
        backendId: 'external-beta',
        externalId: 'external-beta',
        origin: 'chatgpt-web',
        updatedAt: 1_709_900_000_000,
        messages: [
            { id: 'beta-u1', role: 'user', content: '给我一个 Beta 版本排期草案。' },
            { id: 'beta-a1', role: 'assistant', content: '建议先完成接口冻结，再预留一周给联调和回归。' }
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
            { id: 'ga-u1', role: 'user', content: '整理一下这周的 Gemini 迭代结论。' },
            { id: 'ga-a1', role: 'assistant', content: '本周重点是规则远程化、标签页桥接和错误规范化。' }
        ]
    },
    'gemini-beta': {
        id: 'preview-gemini-beta',
        title: 'Gemini Incident Draft',
        backendId: 'gemini-beta',
        externalId: 'gemini-beta',
        origin: 'gemini-web',
        updatedAt: 1_710_050_000_000,
        messages: [
            { id: 'gb-u1', role: 'user', content: '给我一份故障通报草稿。' },
            { id: 'gb-a1', role: 'assistant', content: '建议先说明影响范围，再补恢复动作与后续改进。' }
        ]
    }
};

export function createMockHistoryProvider(providerId: Exclude<ExternalHistoryProviderId, 'external-file'> = 'chatgpt-web'): IHistoryProvider {
    return {
        id: providerId,
        async getHistoryList() {
            return (MOCK_SUMMARIES[providerId] || []).map((item) => ({ ...item }));
        },
        async getHistoryDetail(externalId: string) {
            if (providerId === 'gemini-web' && externalId === 'gemini-beta') {
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
