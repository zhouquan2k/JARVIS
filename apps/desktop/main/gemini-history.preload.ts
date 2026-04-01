import { contextBridge } from 'electron';
import type { ExternalHistoryErrorCode, GeminiHistoryRemoteConfig } from '@packages/core/src';
import {
    extractGeminiMessageText,
    extractHistoryItemTitle,
    getRequiredSelectorKeys,
    waitForSelectorGroup,
    type GeminiContentConversationDetail,
    type GeminiContentHistorySummary,
    type GeminiContentRequest,
    type GeminiContentResponse
} from '@packages/core/src';

type QuerySelector = (selector: string) => Element | null;
type LocationLike = {
    pathname: string;
    hostname: string;
    href?: string;
};

const GEMINI_HISTORY_READY_MAX_ATTEMPTS = 8;
const GEMINI_HISTORY_READY_RETRY_DELAY_MS = 400;

function createError(code: ExternalHistoryErrorCode, message: string): GeminiContentResponse {
    return {
        ok: false,
        error: {
            code,
            message
        }
    };
}

function getCombinedMessageSelector(config: GeminiHistoryRemoteConfig): string {
    return [config.selectors.userBubble, config.selectors.assistantBubble]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .join(', ');
}

function defaultQuerySelector(selector: string): Element | null {
    return document.querySelector(selector);
}

function isGeminiAppPath(location: LocationLike): boolean {
    return /gemini\.google\.com/i.test(location.hostname) && /^\/app(?:\/|$)/u.test(location.pathname);
}

function hasLoginKeyword(bodyText: string): boolean {
    return /(sign in|log in|登录|登入)/i.test(bodyText);
}

function locationLooksLikeLogin(location: LocationLike): boolean {
    return /signin|login/i.test(location.pathname) || /accounts\.google\.com/i.test(location.hostname);
}

export function hasGeminiHistoryScaffold(
    config: GeminiHistoryRemoteConfig,
    querySelector: QuerySelector = defaultQuerySelector
): boolean {
    return Boolean(
        querySelector(config.selectors.historyListContainer)
        || querySelector(config.selectors.historyListItem)
    );
}

export function isAuthRequired(
    config: GeminiHistoryRemoteConfig,
    options: {
        querySelector?: QuerySelector;
        location?: LocationLike;
        bodyText?: string;
    } = {}
): boolean {
    const querySelector = options.querySelector ?? defaultQuerySelector;
    const location = options.location ?? window.location;
    const loginGateSelector = config.selectors.loginGate;
    const hasHistoryScaffold = hasGeminiHistoryScaffold(config, querySelector);
    const hasGoogleAccountGate = Boolean(querySelector('a[href*="accounts.google.com"], form[action*="accounts.google.com"]'));
    const bodyText = (options.bodyText ?? document.body?.innerText ?? '').trim();
    const hasLoginKeywordSignal = hasLoginKeyword(bodyText);
    const locationLooksLikeLoginSignal = locationLooksLikeLogin(location);

    if (loginGateSelector && querySelector(loginGateSelector)) {
        return true;
    }

    if (hasGoogleAccountGate && !hasHistoryScaffold && (hasLoginKeywordSignal || locationLooksLikeLoginSignal)) {
        return true;
    }

    if (hasLoginKeywordSignal) {
        return true;
    }

    if (locationLooksLikeLoginSignal) {
        return true;
    }

    return false;
}

export function shouldTreatMissingHistoryScaffoldAsAuthRequired(
    config: GeminiHistoryRemoteConfig,
    options: {
        querySelector?: QuerySelector;
        location?: LocationLike;
        bodyText?: string;
    } = {}
): boolean {
    const querySelector = options.querySelector ?? defaultQuerySelector;
    const location = options.location ?? window.location;
    const bodyText = (options.bodyText ?? document.body?.innerText ?? '').trim();
    const missingHistoryScaffold = !hasGeminiHistoryScaffold(config, querySelector);
    if (!missingHistoryScaffold) {
        return false;
    }

    const explicitLoginSignal = Boolean(
        (config.selectors.loginGate && querySelector(config.selectors.loginGate))
        || hasLoginKeyword(bodyText)
        || locationLooksLikeLogin(location)
    );

    if (isGeminiAppPath(location) && !explicitLoginSignal) {
        return false;
    }

    return true;
}

async function waitForGeminiHistoryReady(config: GeminiHistoryRemoteConfig): Promise<void> {
    for (let attempt = 1; attempt <= GEMINI_HISTORY_READY_MAX_ATTEMPTS; attempt += 1) {
        const bodyText = document.body?.innerText ?? '';
        if (
            hasGeminiHistoryScaffold(config)
            || isAuthRequired(config, { bodyText })
            || shouldTreatMissingHistoryScaffoldAsAuthRequired(config, { bodyText })
        ) {
            return;
        }

        if (attempt < GEMINI_HISTORY_READY_MAX_ATTEMPTS) {
            await new Promise((resolve) => setTimeout(resolve, GEMINI_HISTORY_READY_RETRY_DELAY_MS));
        }
    }

}

async function runHealthCheck(request: GeminiContentRequest): Promise<GeminiContentResponse | null> {
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
    if (!request.config.matchOrigins.includes(window.location.origin)) {
        return createError('AUTH_REQUIRED', '当前标签页不在 Gemini 站点上下文中。');
    }

    if (request.action === 'GET_HISTORY_LIST') {
        await waitForGeminiHistoryReady(request.config);
    }

    if (isAuthRequired(request.config)) {
        return createError('AUTH_REQUIRED', 'Gemini 页面当前未登录。');
    }

    if (request.action === 'GET_HISTORY_LIST' && shouldTreatMissingHistoryScaffoldAsAuthRequired(request.config, {
        bodyText: document.body?.innerText ?? ''
    })) {
        return createError('AUTH_REQUIRED', 'Gemini 页面当前未登录。');
    }

    const healthCheckResult = await runHealthCheck(request);
    if (healthCheckResult) {
        return healthCheckResult;
    }

    try {
        if (request.action === 'GET_HISTORY_LIST') {
            const data = extractHistoryList(request.config);
            return {
                ok: true,
                data
            };
        }

        const data = await extractConversationDetail(request.config, request.externalId);
        return {
            ok: true,
            data
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Gemini DOM scraping failed';
        return createError('DETAIL_NOT_FOUND', message);
    }
}

contextBridge.exposeInMainWorld('chatprismGeminiHistory', {
    request(request: GeminiContentRequest) {
        return handleRequest(request);
    }
});
