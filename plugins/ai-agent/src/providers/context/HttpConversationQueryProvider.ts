import { HttpApiClient } from '@plugins/ai-agent/src/internal';
import { resolveContextBaseUrl, type ResolveContextBaseUrlOptions } from '@packages/core/config';
import type { Conversation } from '../../interfaces/Conversation';
import type { ConversationQuery, IConversationQueryProvider } from '../../interfaces/IConversationPersistProvider';

export interface HttpConversationQueryProviderOptions {
    baseUrl?: string;
    env?: ResolveContextBaseUrlOptions['env'];
    fetchImpl?: typeof fetch;
}

/**
 * 会话查询的 HTTP 实现，归属 ai-agent 插件。供「宿主提供的 context provider 不自带 getConversations」
 * 的宿主（如 web2 / desktop2）使用——插件自行按文档作用域查询会话，不依赖宿主暴露会话能力。
 */
export class HttpConversationQueryProvider implements IConversationQueryProvider {
    private readonly client: HttpApiClient;

    constructor(options: HttpConversationQueryProviderOptions = {}) {
        this.client = new HttpApiClient({
            baseUrl: options.baseUrl ?? resolveContextBaseUrl(options.env ?? {}),
            fetchImpl: options.fetchImpl,
            source: 'context'
        });
    }

    async getConversations(query: ConversationQuery): Promise<Conversation[]> {
        const response = await this.client.postJson<{ conversations: Conversation[] }>('/get-conversations', { ...query });
        return response.conversations;
    }
}

/**
 * 将宿主提供的 context provider 适配为会话查询 provider：
 * - 若宿主的 context provider 自带 `getConversations`：直接复用。
 * - 否则回退到插件自建的 HTTP 会话查询。
 */
export function toConversationQueryProvider(
    contextProvider: unknown,
    env?: ResolveContextBaseUrlOptions['env']
): IConversationQueryProvider {
    const maybe = contextProvider as Partial<IConversationQueryProvider> | null | undefined;
    if (maybe && typeof maybe.getConversations === 'function') {
        return maybe as IConversationQueryProvider;
    }

    return new HttpConversationQueryProvider({ env });
}
