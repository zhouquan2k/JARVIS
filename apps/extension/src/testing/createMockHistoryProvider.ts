import type { Conversation, ConversationHistorySummary, IHistoryProvider } from '@packages/core/src';

const MOCK_SOURCE = 'chatgpt_web' as const;

const mockHistoryItems: ConversationHistorySummary[] = [
    {
        id: 'external-alpha',
        title: 'Alpha Research Notes',
        updatedAt: 1_710_000_000_000,
        sourceType: MOCK_SOURCE
    },
    {
        id: 'external-beta',
        title: 'Beta Planning Session',
        updatedAt: 1_709_900_000_000,
        sourceType: MOCK_SOURCE
    }
];

const mockConversationDetails: Record<string, Conversation> = {
    'external-alpha': {
        id: 'preview-alpha',
        title: 'Alpha Research Notes',
        backendId: 'external-alpha',
        externalId: 'external-alpha',
        sourceType: MOCK_SOURCE,
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
        sourceType: MOCK_SOURCE,
        updatedAt: 1_709_900_000_000,
        messages: [
            { id: 'beta-u1', role: 'user', content: '给我一个 Beta 版本排期草案。' },
            { id: 'beta-a1', role: 'assistant', content: '建议先完成接口冻结，再预留一周给联调和回归。' }
        ]
    }
};

export function createMockHistoryProvider(): IHistoryProvider {
    return {
        id: 'chatgpt-web',
        async getHistoryList() {
            return mockHistoryItems.map((item) => ({ ...item }));
        },
        async getHistoryDetail(externalId: string) {
            const detail = mockConversationDetails[externalId];
            if (!detail) {
                throw new Error(`Mock history conversation '${externalId}' not found`);
            }
            return {
                ...detail,
                messages: detail.messages.map((message) => ({ ...message }))
            };
        }
    };
}
