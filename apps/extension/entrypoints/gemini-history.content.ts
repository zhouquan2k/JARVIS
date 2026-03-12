import type { ExternalHistoryErrorCode, GeminiHistoryRemoteConfig } from '@packages/core/src';
import type {
    GeminiContentConversationDetail,
    GeminiContentHistorySummary,
    GeminiContentRequest,
    GeminiContentResponse
} from '../src/history/geminiContentProtocol';
import { getRequiredSelectorKeys, waitForSelectorGroup } from '../src/history/geminiContentHealth';
import { extractHistoryItemTitle } from '../src/history/geminiHistoryListTitle';
import { extractGeminiMessageText } from '../src/history/geminiMessageSerializer';

function createError(code: ExternalHistoryErrorCode, message: string): GeminiContentResponse {
    return {
        ok: false,
        error: {
            code,
            message
        }
    };
}

function textFromElement(element: Element | null): string {
    return element?.textContent?.trim() || '';
}

function getCombinedMessageSelector(config: GeminiHistoryRemoteConfig): string {
    return [config.selectors.userBubble, config.selectors.assistantBubble]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .join(', ');
}

function isAuthRequired(config: GeminiHistoryRemoteConfig): boolean {
    const loginGateSelector = config.selectors.loginGate;
    if (loginGateSelector && document.querySelector(loginGateSelector)) {
        return true;
    }

    return /signin|login/i.test(window.location.pathname);
}

async function runHealthCheck(request: GeminiContentRequest): Promise<GeminiContentResponse | null> {
    if (request.action === 'PING') {
        return null;
    }

    const requiredKeys = getRequiredSelectorKeys(request.action, request.config);
    const healthy = await waitForSelectorGroup(request.config, requiredKeys);
    if (!healthy) {
        return createError('SELECTOR_MISMATCH', 'Gemini 页面结构与远程配置不匹配。');
    }

    return null;
}

function extractHistoryList(config: GeminiHistoryRemoteConfig): GeminiContentHistorySummary[] {
    const containerSelector = config.selectors.historyListContainer;
    const itemSelector = config.selectors.historyListItem;
    const titleSelector = config.selectors.historyTitle;
    const linkSelector = config.selectors.historyLink;
    const seenIds = new Set<string>();
    let fallbackIndex = 0;

    return Array.from(document.querySelectorAll(containerSelector))
        .flatMap((container) => Array.from(container.querySelectorAll(itemSelector)))
        .map((item, index) => {
            const linkElement = (item.matches(linkSelector) ? item : item.querySelector(linkSelector)) as HTMLAnchorElement | null;
            const href = linkElement?.href || '';
            const derivedId = href.split('/app/')[1]?.split(/[?#]/)[0]?.trim() || '';
            const id = derivedId || `gemini-history-${fallbackIndex++}`;
            const title = extractHistoryItemTitle(item, titleSelector, linkElement) || `Gemini History ${index + 1}`;

            return {
                id,
                title,
                updatedAt: Date.now() - index
            };
        })
        .filter((item) => {
            if (!item.id.length || seenIds.has(item.id)) {
                return false;
            }

            seenIds.add(item.id);
            return true;
        });
}

async function maybeLoadMore(config: GeminiHistoryRemoteConfig): Promise<void> {
    const sentinelSelector = config.selectors.lazyLoadSentinel;
    if (!sentinelSelector) {
        return;
    }

    const sentinel = document.querySelector(sentinelSelector);
    if (sentinel instanceof HTMLElement) {
        sentinel.scrollIntoView({ block: 'end' });
        await new Promise((resolve) => setTimeout(resolve, 300));
    }
}

async function extractConversationDetail(config: GeminiHistoryRemoteConfig, externalId?: string): Promise<GeminiContentConversationDetail> {
    await maybeLoadMore(config);

    const root = document.querySelector(config.selectors.conversationRoot);
    if (!root) {
        throw new Error('conversationRoot not found');
    }

    const messageSelector = getCombinedMessageSelector(config);
    const messageElements = Array.from(root.querySelectorAll(messageSelector));
    const messages = messageElements
        .map((element, index) => {
            const role = element.matches(config.selectors.userBubble) ? 'user' as const : 'assistant' as const;
            return {
                id: `${externalId || 'gemini'}-${index + 1}`,
                role,
                content: extractGeminiMessageText(element, role)
            };
        })
        .filter((message) => message.content.length > 0);

    if (messages.length === 0) {
        throw new Error('No renderable Gemini messages found');
    }

    return {
        id: externalId || window.location.pathname.split('/app/')[1] || crypto.randomUUID(),
        title: document.title.replace(/\s*-\s*Gemini\s*$/i, '').trim() || 'Gemini Conversation',
        updatedAt: Date.now(),
        messages
    };
}

async function handleRequest(request: GeminiContentRequest): Promise<GeminiContentResponse> {
    if (request.action === 'PING') {
        return {
            ok: true,
            data: {
                ready: true
            }
        };
    }

    if (!request.config.matchOrigins.includes(window.location.origin)) {
        return createError('AUTH_REQUIRED', '当前标签页不在 Gemini 站点上下文中。');
    }

    if (isAuthRequired(request.config)) {
        return createError('AUTH_REQUIRED', 'Gemini 页面当前未登录。');
    }

    const healthCheckResult = await runHealthCheck(request);
    if (healthCheckResult) {
        return healthCheckResult;
    }

    try {
        if (request.action === 'GET_HISTORY_LIST') {
            return {
                ok: true,
                data: extractHistoryList(request.config)
            };
        }

        if (request.action === 'GET_HISTORY_DETAIL') {
            return {
                ok: true,
                data: await extractConversationDetail(request.config, request.externalId)
            };
        }

        return createError('UNKNOWN', `Unsupported Gemini content action: ${request.action}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Gemini DOM scraping failed';
        return createError('DETAIL_NOT_FOUND', message);
    }
}

export default defineContentScript({
    matches: ['https://gemini.google.com/*'],
    main() {
        chrome.runtime.onMessage.addListener((message: GeminiContentRequest, _sender, sendResponse) => {
            void handleRequest(message).then(sendResponse);
            return true;
        });
    }
});
