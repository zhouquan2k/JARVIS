import {
    ExternalHistoryError,
    type ConversationHistorySummary,
    type HistoryListQueryOptions,
    type IHistoryProvider
} from '../../../interfaces/IHistoryProvider';
import type { GeminiHistoryBridge } from './GeminiHistoryBridge';
import type { GeminiHistoryConfigLoader } from './GeminiHistoryConfigLoader';
import type { Conversation } from '../../../interfaces/IStorageProvider';

function normalizeTitle(value: string | undefined): string {
    const trimmed = value?.trim();
    return trimmed || 'Untitled Conversation';
}

function isGenericGeminiTitle(value: string | undefined): boolean {
    const normalized = value?.trim().toLowerCase();
    return !normalized || normalized === 'google gemini' || normalized === 'gemini';
}

export class GeminiDomHistoryProvider implements IHistoryProvider {
    public readonly id = 'gemini-web' as const;
    private readonly summaryTitleById = new Map<string, string>();

    constructor(private readonly deps: {
        configLoader: GeminiHistoryConfigLoader;
        tabBridge: GeminiHistoryBridge;
    }) {}

    async getHistoryList(options: HistoryListQueryOptions = {}): Promise<ConversationHistorySummary[]> {
        const configResult = await this.deps.configLoader.load();
        const summaries = await this.deps.tabBridge.getHistoryList(configResult.config, options);
        await this.deps.configLoader.markValidated(configResult.config);

        return summaries.map((item) => {
            const title = normalizeTitle(item.title);
            this.summaryTitleById.set(item.id, title);

            return {
                id: item.id,
                title,
                updatedAt: item.updatedAt,
                origin: 'gemini-web'
            };
        });
    }

    async getHistoryDetail(externalId: string): Promise<Conversation> {
        const configResult = await this.deps.configLoader.load();
        const detail = await this.deps.tabBridge.getHistoryDetail(configResult.config, externalId);
        await this.deps.configLoader.markValidated(configResult.config);
        const messages = detail.messages.filter((message) => message.content.trim().length > 0);

        if (messages.length === 0) {
            throw new ExternalHistoryError('DETAIL_NOT_FOUND', '未抓取到 Gemini 对话详情。', {
                providerId: 'gemini-web'
            });
        }

        const title = isGenericGeminiTitle(detail.title)
            ? normalizeTitle(this.summaryTitleById.get(externalId) || detail.title)
            : normalizeTitle(detail.title);

        return {
            id: crypto.randomUUID(),
            title,
            backendId: detail.id || externalId,
            externalId,
            origin: 'gemini-web',
            updatedAt: detail.updatedAt,
            messages: messages.map((message) => ({
                id: message.id,
                role: message.role,
                content: message.content
            }))
        };
    }
}
