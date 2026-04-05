import type { ExternalHistoryErrorCode } from '../../../interfaces/IExternalConversationProvider';
import type { GeminiHistoryRemoteConfig } from '../../../interfaces/ProviderRemoteConfig';
import { extractGeminiMessageText } from './geminiMessageSerializer';
import { extractHistoryItemTitle } from './geminiHistoryListTitle';
import { getRequiredSelectorKeys, waitForSelectorGroup } from './geminiContentHealth';
import type {
    GeminiContentConversationDetail,
    GeminiContentHistorySummary,
    GeminiContentRequest,
    GeminiContentResponse
} from './geminiContentProtocol';

type QuerySelector = (selector: string) => Element | null;
type LocationLike = {
    pathname: string;
    hostname: string;
    href?: string;
    origin?: string;
};
type SearchInputLike = HTMLInputElement | HTMLTextAreaElement | HTMLElement;
type HistoryLinkLike = HTMLAnchorElement | Element;
type SearchStabilizationState = {
    query: string;
    baselineSignature: string;
    acceptCurrentSignature?: boolean;
};

export interface GeminiDomScraperOptions {
    debug?: (stage: string, payload?: unknown) => void;
    mode?: 'desktop' | 'extension';
}

const GEMINI_HISTORY_READY_MAX_ATTEMPTS = 8;
const GEMINI_HISTORY_READY_RETRY_DELAY_MS = 400;
const GEMINI_HISTORY_SEARCH_SETTLE_DELAY_MS = 500;
const GEMINI_HISTORY_SEARCH_TIMEOUT_MS = 8000;
const GEMINI_HISTORY_DETAIL_SETTLE_DELAY_MS = 500;
const GEMINI_HISTORY_DETAIL_TIMEOUT_MS = 8000;
const GEMINI_HISTORY_DEBUG_TEXT_MAX = 120;
const GEMINI_HISTORY_DEBUG_TITLE_MAX = 48;
const GEMINI_HISTORY_DEBUG_ATTRIBUTE_MAX = 80;
const GEMINI_HISTORY_DEBUG_ROW_LIMIT = 4;
const GEMINI_HISTORY_DEBUG_DESCENDANT_ATTR_LIMIT = 4;
const SEARCH_WINDOW_STRUCTURAL_CLASS_PATTERNS = [
    /search-window-container/i,
    /search-window-title/i,
    /content-wrapper/i,
    /content-container/i
];
const SEARCH_WINDOW_STRUCTURAL_TAGS = new Set(['search-window', 'search-bar', 'h1', 'h2', 'h3', 'mat-icon']);
const GEMINI_TEMP_SEARCH_RESULT_PREFIX = 'gemini-search-result:';

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

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSearchQuery(query: string | undefined): string {
    return query?.trim() || '';
}

function summarizeText(value: string | null | undefined, maxLength = GEMINI_HISTORY_DEBUG_TEXT_MAX): string {
    const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, maxLength)}...`;
}

function describeElementSignature(element: Element | null) {
    if (!element) {
        return null;
    }

    const htmlElement = element instanceof HTMLElement ? element : null;
    return {
        tagName: element.tagName.toLowerCase(),
        role: element.getAttribute('role'),
        dataTestId: element.getAttribute('data-test-id'),
        ariaLabel: element.getAttribute('aria-label'),
        className: summarizeText(htmlElement?.className || '', 48),
        text: summarizeText(element.textContent, GEMINI_HISTORY_DEBUG_TITLE_MAX)
    };
}

function describeElementPath(element: Element | null, depth = 3): string[] {
    const path: string[] = [];
    let current: Element | null = element;
    while (current && path.length < depth) {
        const className = current instanceof HTMLElement
            ? summarizeText(current.className || '', 40)
            : '';
        path.push([
            current.tagName.toLowerCase(),
            current.getAttribute('role') ? `[role="${current.getAttribute('role')}"]` : '',
            current.getAttribute('data-test-id') ? `[data-test-id="${current.getAttribute('data-test-id')}"]` : '',
            className ? `.${className}` : ''
        ].join(''));
        current = current.parentElement;
    }

    return path;
}

function normalizeHistoryHref(rawValue: string | null | undefined): string {
    const value = rawValue?.trim();
    if (!value) {
        return '';
    }

    const match = value.match(/https?:\/\/[^"'\\\s]+\/app\/[^"'\\\s?#]+|\/app\/[^"'\\\s?#]+/u);
    if (!match) {
        return '';
    }

    const href = match[0];
    return href.startsWith('http') ? href : `${window.location.origin}${href}`;
}

function buildTemporarySearchResultId(query: string, index: number): string {
    return `${GEMINI_TEMP_SEARCH_RESULT_PREFIX}${encodeURIComponent(query)}:${index}`;
}

function parseTemporarySearchResultId(externalId?: string): { query: string; index: number } | null {
    const value = externalId?.trim();
    if (!value?.startsWith(GEMINI_TEMP_SEARCH_RESULT_PREFIX)) {
        return null;
    }

    const encodedPayload = value.slice(GEMINI_TEMP_SEARCH_RESULT_PREFIX.length);
    const separatorIndex = encodedPayload.lastIndexOf(':');
    if (separatorIndex <= 0) {
        return null;
    }

    const encodedQuery = encodedPayload.slice(0, separatorIndex);
    const parsedIndex = Number(encodedPayload.slice(separatorIndex + 1));
    if (!Number.isInteger(parsedIndex) || parsedIndex < 0) {
        return null;
    }

    return {
        query: decodeURIComponent(encodedQuery),
        index: parsedIndex
    };
}

function extractHistoryHrefFromOwnAttributes(element: Element | null): string {
    if (!element) {
        return '';
    }

    if (element instanceof HTMLAnchorElement) {
        return normalizeHistoryHref(element.getAttribute('href') || element.href);
    }

    for (const attribute of Array.from(element.attributes)) {
        const href = normalizeHistoryHref(attribute.value);
        if (href) {
            return href;
        }
    }

    return '';
}

function isGeminiAppPath(location: LocationLike): boolean {
    return /gemini\.google\.com/i.test(location.hostname) && /^\/app(?:\/|$)/u.test(location.pathname);
}

function isGeminiSearchPath(location: LocationLike): boolean {
    return /gemini\.google\.com/i.test(location.hostname) && /^\/search(?:\/|$)/u.test(location.pathname);
}

function hasLoginKeyword(bodyText: string): boolean {
    return /(sign in|log in|登录|登入)/i.test(bodyText);
}

function locationLooksLikeLogin(location: LocationLike): boolean {
    return /signin|login/i.test(location.pathname) || /accounts\.google\.com/i.test(location.hostname);
}

export function createGeminiDomScraper(options: GeminiDomScraperOptions = {}) {
    let lastSearchStabilizationState: SearchStabilizationState | null = null;
    const debug = options.debug ?? (() => {});

    function debugHistory(stage: string, payload?: unknown) {
        debug(stage, payload);
    }

    function getSearchWindowSummary(config: GeminiHistoryRemoteConfig) {
        const selector = config.selectors.historySearchResultContainer;
        if (!selector?.trim()) {
            return {
                selector,
                containerCount: 0,
                candidateCount: 0,
                firstCandidate: null
            };
        }

        const containers = Array.from(document.querySelectorAll(selector));
        const candidates = containers
            .flatMap((container) => {
                const nodes = [container, ...Array.from(container.querySelectorAll('*'))];
                return nodes
                    .map((node) => ({
                        node,
                        href: extractHistoryHrefFromOwnAttributes(node)
                    }))
                    .filter((entry) => entry.href.length > 0)
                    .map((entry) => ({
                        href: entry.href,
                        signature: describeElementSignature(entry.node),
                        parent: describeElementSignature(entry.node.parentElement),
                        path: describeElementPath(entry.node)
                    }));
            })
            .slice(0, GEMINI_HISTORY_DEBUG_ROW_LIMIT);

        return {
            selector,
            containerCount: containers.length,
            candidateCount: candidates.length,
            firstCandidate: candidates[0] ?? null
        };
    }

    function getDetailDomSnapshot(config: GeminiHistoryRemoteConfig) {
        const conversationRoot = document.querySelector(config.selectors.conversationRoot);
        const userBubbleCount = document.querySelectorAll(config.selectors.userBubble).length;
        const assistantBubbleCount = document.querySelectorAll(config.selectors.assistantBubble).length;
        const messageSelector = getCombinedMessageSelector(config);
        const combinedMessageCount = messageSelector ? document.querySelectorAll(messageSelector).length : 0;

        return {
            location: {
                href: window.location.href,
                pathname: window.location.pathname
            },
            title: document.title,
            conversationRoot: describeElementSignature(conversationRoot),
            userBubbleCount,
            assistantBubbleCount,
            combinedMessageCount,
            authRequired: isAuthRequired(config),
            missingHistoryScaffoldAsAuthRequired: shouldTreatMissingHistoryScaffoldAsAuthRequired(config, {
                bodyText: document.body?.innerText ?? ''
            })
        };
    }

    function hasHistoryAttribute(element: Element | null): boolean {
        if (!element) {
            return false;
        }

        return Array.from(element.attributes).some((attribute) => {
            return /^(data-|aria-|ng-reflect-|routerlink|href|jslog|onclick|role$)/i.test(attribute.name)
                || /\/app\//.test(attribute.value);
        });
    }

    function isSearchInputElement(element: Element | null): element is SearchInputLike {
        return Boolean(
            element
            && (
                element instanceof HTMLInputElement
                || element instanceof HTMLTextAreaElement
                || (element instanceof HTMLElement && (
                    element.isContentEditable
                    || element.getAttribute('role') === 'searchbox'
                    || element.getAttribute('role') === 'textbox'
                ))
            )
        );
    }

    function countSelectorMatches(selector?: string): number {
        if (!selector?.trim()) {
            return 0;
        }

        return document.querySelectorAll(selector).length;
    }

    function getSearchInputLabel(input: SearchInputLike | null): string {
        if (!input) {
            return '';
        }

        return [
            input.getAttribute('aria-label'),
            input.getAttribute('placeholder'),
            input.getAttribute('role')
        ]
            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            .join(' ')
            .trim();
    }

    function isGeminiPromptComposerInput(input: SearchInputLike): boolean {
        const label = getSearchInputLabel(input);
        return /gemini/i.test(label) && /输入提示|prompt/i.test(label);
    }

    function getHistoryItemSelector(config: GeminiHistoryRemoteConfig, query?: string): string {
        const normalizedQuery = normalizeSearchQuery(query);
        if (normalizedQuery && config.selectors.historySearchResultItem?.trim()) {
            return config.selectors.historySearchResultItem;
        }

        return config.selectors.historyListItem;
    }

    function getHistoryDomSnapshot(config: GeminiHistoryRemoteConfig, query?: string) {
        return {
            query,
            activeItemSelector: getHistoryItemSelector(config, query),
            searchInputMatches: countSelectorMatches(config.selectors.historySearchInput),
            searchSubmitMatches: countSelectorMatches(config.selectors.historySearchSubmit),
            searchResultContainerMatches: countSelectorMatches(config.selectors.historySearchResultContainer),
            searchResultMatches: countSelectorMatches(config.selectors.historySearchResultItem),
            searchEmptyStateMatches: countSelectorMatches(config.selectors.historySearchEmptyState),
            recentListMatches: countSelectorMatches(config.selectors.historyListItem),
            visibleItemMatches: queryHistoryItemElements(config, query).length
        };
    }

    function describeSearchInput(input: SearchInputLike | null) {
        if (!input) {
            return null;
        }

        return {
            tagName: input.tagName.toLowerCase(),
            role: input.getAttribute('role'),
            type: input instanceof HTMLInputElement ? input.type : null,
            isContentEditable: input instanceof HTMLElement ? input.isContentEditable : false,
            placeholder: input.getAttribute('placeholder'),
            ariaLabel: input.getAttribute('aria-label'),
            value: readSearchInputValue(input)
        };
    }

    function resolveSearchInput(config: GeminiHistoryRemoteConfig): SearchInputLike | null {
        const selector = config.selectors.historySearchInput;
        if (!selector) {
            return null;
        }

        const candidates = Array.from(document.querySelectorAll(selector))
            .filter(isSearchInputElement);

        const preferred = candidates.find((candidate) => !isGeminiPromptComposerInput(candidate));
        return preferred ?? null;
    }

    function readSearchInputValue(input: SearchInputLike | null): string {
        if (!input) {
            return '';
        }

        if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
            return input.value?.trim() || '';
        }

        return input.textContent?.trim() || '';
    }

    function setSearchInputValue(input: SearchInputLike, value: string) {
        if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
            const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value');
            if (descriptor?.set) {
                descriptor.set.call(input, value);
            } else {
                input.value = value;
            }
        } else {
            input.textContent = value;
        }

        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function submitSearchInput(
        config: GeminiHistoryRemoteConfig,
        input: SearchInputLike,
        options: { preferKeyboard?: boolean } = {}
    ) {
        const submitSelector = config.selectors.historySearchSubmit;
        const submitButton = submitSelector ? document.querySelector(submitSelector) : null;
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
        if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
            input.form?.requestSubmit?.();
        }

        if (options.preferKeyboard) {
            return;
        }

        if (submitButton instanceof HTMLElement) {
            submitButton.click();
        }
    }

    async function ensureSearchInputVisible(
        config: GeminiHistoryRemoteConfig,
        query?: string
    ): Promise<{ input: SearchInputLike | null; openedByTrigger: boolean }> {
        const normalizedQuery = normalizeSearchQuery(query);
        let input = resolveSearchInput(config);
        let openedByTrigger = false;
        if (input || !normalizedQuery) {
            debugHistory('search-input-ready', {
                query: normalizedQuery,
                openedByTrigger,
                input: describeSearchInput(input),
                snapshot: getHistoryDomSnapshot(config, normalizedQuery)
            });
            return { input, openedByTrigger };
        }

        const submitSelector = config.selectors.historySearchSubmit;
        const trigger = submitSelector ? document.querySelector(submitSelector) : null;
        if (trigger instanceof HTMLElement) {
            debugHistory('search-open-trigger', {
                query: normalizedQuery,
                selector: submitSelector,
                triggerTagName: trigger.tagName.toLowerCase(),
                triggerAriaLabel: trigger.getAttribute('aria-label'),
                snapshotBeforeOpen: getHistoryDomSnapshot(config, normalizedQuery)
            });
            trigger.click();
            await sleep(180);
            input = resolveSearchInput(config);
            openedByTrigger = !!input;
        }

        debugHistory('search-input-ready', {
            query: normalizedQuery,
            openedByTrigger,
            input: describeSearchInput(input),
            snapshot: getHistoryDomSnapshot(config, normalizedQuery)
        });

        return { input, openedByTrigger };
    }

    function queryItemsWithinContainers(containerSelector: string, itemSelector: string): Element[] {
        return Array.from(document.querySelectorAll(containerSelector))
            .flatMap((container) => Array.from(container.querySelectorAll(itemSelector)));
    }

    function resolveHistoryLinkLikeElement(item: Element, linkSelector: string): HistoryLinkLike | null {
        const directMatch = item.matches(linkSelector) ? item : item.querySelector(linkSelector);
        if (directMatch && extractHistoryHrefFromOwnAttributes(directMatch)) {
            return directMatch;
        }

        const fallbackAnchor = item instanceof HTMLAnchorElement
            ? item
            : item.querySelector('a');
        if (fallbackAnchor instanceof HTMLAnchorElement && extractHistoryHrefFromOwnAttributes(fallbackAnchor)) {
            return fallbackAnchor;
        }

        const descendantWithHistoryHref = Array.from(item.querySelectorAll('*'))
            .find((candidate) => extractHistoryHrefFromOwnAttributes(candidate));
        if (descendantWithHistoryHref) {
            return descendantWithHistoryHref;
        }

        return extractHistoryHrefFromOwnAttributes(item) ? item : null;
    }

    function resolveHistoryClickableElement(item: Element, linkSelector: string): HTMLElement | null {
        const linkLikeElement = resolveHistoryLinkLikeElement(item, linkSelector);
        if (linkLikeElement instanceof HTMLElement) {
            return linkLikeElement;
        }

        if (
            item instanceof HTMLElement
            && item.matches('a, button, [role="option"], [role="button"], [role="link"], [tabindex]')
        ) {
            return item;
        }

        const interactiveDescendant = item.querySelector<HTMLElement>('button, a, [role="option"], [role="button"], [role="link"]');
        return interactiveDescendant ?? null;
    }

    function dispatchSyntheticClick(target: HTMLElement) {
        const mouseEventInit: MouseEventInit = {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window
        };
        target.dispatchEvent(new PointerEvent('pointerdown', mouseEventInit));
        target.dispatchEvent(new MouseEvent('mousedown', mouseEventInit));
        target.dispatchEvent(new PointerEvent('pointerup', mouseEventInit));
        target.dispatchEvent(new MouseEvent('mouseup', mouseEventInit));
        target.dispatchEvent(new MouseEvent('click', mouseEventInit));
    }

    function isStructuralSearchWindowElement(element: Element, config: GeminiHistoryRemoteConfig): boolean {
        if (SEARCH_WINDOW_STRUCTURAL_TAGS.has(element.tagName.toLowerCase())) {
            return true;
        }

        const htmlElement = element instanceof HTMLElement ? element : null;
        const className = htmlElement?.className || '';
        if (SEARCH_WINDOW_STRUCTURAL_CLASS_PATTERNS.some((pattern) => pattern.test(className))) {
            return true;
        }

        const searchInputSelector = config.selectors.historySearchInput;
        return Boolean(searchInputSelector?.trim() && element.querySelector(searchInputSelector));
    }

    function getSearchWindowRowCandidates(config: GeminiHistoryRemoteConfig): Element[] {
        const containerSelector = config.selectors.historySearchResultContainer;
        if (!containerSelector?.trim()) {
            return [];
        }

        const semanticSelector = [
            'article',
            'li',
            '[role="button"]',
            '[role="link"]',
            '[data-test-id]',
            '[ng-reflect-router-link]',
            '[routerlink]',
            '[href]',
            'div'
        ].join(', ');

        return Array.from(document.querySelectorAll(containerSelector))
            .flatMap((container) => Array.from(container.querySelectorAll(semanticSelector)))
            .filter((element) => {
                if (isStructuralSearchWindowElement(element, config)) {
                    return false;
                }

                const text = summarizeText(element.textContent, 180);
                if (text.length < 6 || text.length > 180) {
                    return false;
                }

                if (element.tagName.toLowerCase() === 'div') {
                    return hasHistoryAttribute(element)
                        || Boolean(element.querySelector('button, [role="button"], [role="link"]'))
                        || Boolean(element.querySelector('[ng-reflect-router-link], [routerlink], [href]'));
                }

                return true;
            });
    }

    function collectSearchWindowRowDiagnostics(config: GeminiHistoryRemoteConfig) {
        const containerSelector = config.selectors.historySearchResultContainer;
        if (!containerSelector?.trim()) {
            return {
                rowCount: 0,
                firstRow: null,
                firstDescendantAttribute: null
            };
        }

        const rows = getSearchWindowRowCandidates(config)
            .filter((element) => summarizeText(element.textContent, 80).length >= 6)
            .slice(0, GEMINI_HISTORY_DEBUG_ROW_LIMIT)
            .map((element) => {
                const attributes = Object.fromEntries(
                    Array.from(element.attributes)
                        .filter((attribute) => {
                            return /^(data-|aria-|ng-reflect-|routerlink|href|jslog|onclick|role$)/i.test(attribute.name)
                                || /\/app\//.test(attribute.value);
                        })
                        .slice(0, GEMINI_HISTORY_DEBUG_DESCENDANT_ATTR_LIMIT)
                        .map((attribute) => [attribute.name, summarizeText(attribute.value, GEMINI_HISTORY_DEBUG_ATTRIBUTE_MAX)])
                );

                const descendantAttributes = Array.from(element.querySelectorAll('*'))
                    .flatMap((node) => Array.from(node.attributes)
                        .filter((attribute) => {
                            return /^(data-|aria-|ng-reflect-|routerlink|href|jslog|onclick|role$)/i.test(attribute.name)
                                || /\/app\//.test(attribute.value);
                        })
                        .map((attribute) => ({
                            tagName: node.tagName.toLowerCase(),
                            name: attribute.name,
                            value: summarizeText(attribute.value, GEMINI_HISTORY_DEBUG_ATTRIBUTE_MAX)
                        })))
                    .slice(0, GEMINI_HISTORY_DEBUG_DESCENDANT_ATTR_LIMIT);

                return {
                    signature: describeElementSignature(element),
                    path: describeElementPath(element, 5),
                    attributes,
                    descendantAttributes
                };
            });

        return {
            rowCount: rows.length,
            firstRow: rows[0] ?? null,
            firstDescendantAttribute: rows[0]?.descendantAttributes?.[0] ?? null
        };
    }

    function extractSearchResultRowTitle(
        item: Element,
        config: GeminiHistoryRemoteConfig,
        linkElement: HTMLAnchorElement | null
    ): string {
        const selectorCandidates = [
            config.selectors.historyTitle,
            '.conversation-title',
            '[data-test-id="conversation-title"]',
            '[role="heading"]',
            'h1, h2, h3, h4, h5, h6',
            'button',
            'button span',
            '[role="option"] > *',
            'span, div'
        ]
            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            .join(', ');

        const rankedCandidates = Array.from(item.querySelectorAll(selectorCandidates))
            .map((element) => {
                const text = summarizeText(element.textContent, 120);
                if (!text || text.length > 80) {
                    return null;
                }

                const className = element instanceof HTMLElement ? element.className : '';
                const marker = [
                    className,
                    element.getAttribute('data-test-id') || '',
                    element.getAttribute('aria-label') || '',
                    element.tagName.toLowerCase()
                ].join(' ');
                let score = 0;
                if (/title|heading/i.test(marker)) {
                    score += 100;
                }
                if (/summary|snippet|preview|content|description/i.test(marker)) {
                    score -= 80;
                }
                if (/^h[1-6]$/i.test(element.tagName) || element.getAttribute('role') === 'heading') {
                    score += 60;
                }

                return { text, score };
            })
            .filter((entry): entry is { text: string; score: number } => Boolean(entry))
            .sort((left, right) => right.score - left.score || left.text.length - right.text.length);

        return rankedCandidates[0]?.text || extractHistoryItemTitle(item, config.selectors.historyTitle, linkElement);
    }

    function getSearchWindowResultSignature(config: GeminiHistoryRemoteConfig): string {
        const linkSelector = config.selectors.historyLink;

        return getSearchWindowRowCandidates(config)
            .slice(0, GEMINI_HISTORY_DEBUG_ROW_LIMIT)
            .map((element) => {
                const linkElement = resolveHistoryLinkLikeElement(element, linkSelector);
                return extractSearchResultRowTitle(
                    element,
                    config,
                    linkElement instanceof HTMLAnchorElement ? linkElement : null
                )
                    || summarizeText(element.textContent, GEMINI_HISTORY_DEBUG_TITLE_MAX);
            })
            .filter((value) => value.length > 0)
            .join(' | ');
    }

    function isCurrentSearchResultStillBaseline(config: GeminiHistoryRemoteConfig, query?: string): boolean {
        const normalizedQuery = normalizeSearchQuery(query);
        if (!normalizedQuery || !isGeminiSearchPath(window.location)) {
            return false;
        }

        if (config.selectors.historySearchEmptyState && document.querySelector(config.selectors.historySearchEmptyState)) {
            return false;
        }

        return Boolean(
            lastSearchStabilizationState
            && lastSearchStabilizationState.query === normalizedQuery
            && lastSearchStabilizationState.baselineSignature.length > 0
            && getSearchWindowResultSignature(config) === lastSearchStabilizationState.baselineSignature
        );
    }

    function querySearchWindowHistoryItemElements(config: GeminiHistoryRemoteConfig): Element[] {
        const containerSelector = config.selectors.historySearchResultContainer;
        if (!containerSelector?.trim()) {
            return [];
        }

        const linkSelector = config.selectors.historyLink;
        const explicitSelector = config.selectors.historySearchResultItem?.trim();
        if (explicitSelector) {
            const explicitMatches = queryItemsWithinContainers(containerSelector, explicitSelector)
                .filter((item) => Boolean(resolveHistoryClickableElement(item, linkSelector)));
            if (explicitMatches.length > 0) {
                return explicitMatches;
            }
        }

        const rowCandidates = getSearchWindowRowCandidates(config)
            .filter((item) => Boolean(resolveHistoryClickableElement(item, linkSelector)));
        if (rowCandidates.length > 0) {
            return rowCandidates;
        }

        if (document.querySelector(containerSelector)) {
            debugHistory('search-window-diagnostics', {
                selector: containerSelector,
                explicitSelector,
                rows: collectSearchWindowRowDiagnostics(config)
            });
        }

        const results: Element[] = [];
        const seenHref = new Set<string>();
        for (const container of Array.from(document.querySelectorAll(containerSelector))) {
            const nodes = [container, ...Array.from(container.querySelectorAll('*'))];
            for (const node of nodes) {
                const href = extractHistoryHrefFromOwnAttributes(node);
                if (!href || seenHref.has(href)) {
                    continue;
                }

                const parentHref = extractHistoryHrefFromOwnAttributes(node.parentElement);
                if (parentHref === href) {
                    continue;
                }

                seenHref.add(href);
                results.push(node);
            }
        }

        return results;
    }

    function queryHistoryItemElements(config: GeminiHistoryRemoteConfig, query?: string): Element[] {
        const itemSelector = getHistoryItemSelector(config, query);
        const normalizedQuery = normalizeSearchQuery(query);
        const searchResultContainer = config.selectors.historySearchResultContainer;
        if (normalizedQuery) {
            if (isGeminiSearchPath(window.location) && searchResultContainer?.trim()) {
                return querySearchWindowHistoryItemElements(config);
            }

            return Array.from(document.querySelectorAll(itemSelector));
        }

        return Array.from(document.querySelectorAll(config.selectors.historyListContainer))
            .flatMap((container) => Array.from(container.querySelectorAll(itemSelector)));
    }

    function hasGeminiHistoryScaffold(
        config: GeminiHistoryRemoteConfig,
        querySelector: QuerySelector = defaultQuerySelector
    ): boolean {
        return Boolean(
            querySelector(config.selectors.historyListContainer)
            || querySelector(config.selectors.historyListItem)
        );
    }

    function isAuthRequired(
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

    function shouldTreatMissingHistoryScaffoldAsAuthRequired(
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
                await sleep(GEMINI_HISTORY_READY_RETRY_DELAY_MS);
            }
        }
    }

    async function runHealthCheck(request: GeminiContentRequest): Promise<GeminiContentResponse | null> {
        if (request.action === 'PING') {
            return null;
        }

        const requiredKeys = getRequiredSelectorKeys(request.action, request.config);
        const healthy = await waitForSelectorGroup(request.config, requiredKeys);
        if (!healthy) {
            debugHistory('health-check-failed', {
                action: request.action,
                requiredKeys
            });
            return createError('SELECTOR_MISMATCH', 'Gemini 页面结构与远程配置不匹配。');
        }

        return null;
    }

    function extractHistoryList(config: GeminiHistoryRemoteConfig, query?: string): GeminiContentHistorySummary[] {
        const normalizedQuery = normalizeSearchQuery(query);
        if (
            normalizedQuery
            && isGeminiSearchPath(window.location)
            && config.selectors.historySearchEmptyState
            && document.querySelector(config.selectors.historySearchEmptyState)
        ) {
            return [];
        }

        if (isCurrentSearchResultStillBaseline(config, normalizedQuery)) {
            return [];
        }

        const titleSelector = config.selectors.historyTitle;
        const linkSelector = config.selectors.historyLink;
        const seenIds = new Set<string>();
        const seenSearchKeys = new Set<string>();
        let fallbackIndex = 0;

        const items = queryHistoryItemElements(config, query)
            .map((item, index) => {
                const linkElement = resolveHistoryLinkLikeElement(item, linkSelector);
                const href = extractHistoryHrefFromOwnAttributes(linkElement);
                const derivedId = href.split('/app/')[1]?.split(/[?#]/)[0]?.trim() || '';
                const id = derivedId
                    || (normalizedQuery ? buildTemporarySearchResultId(normalizedQuery, index) : `gemini-history-${fallbackIndex++}`);
                const title = normalizedQuery && isGeminiSearchPath(window.location)
                    ? extractSearchResultRowTitle(item, config, linkElement instanceof HTMLAnchorElement ? linkElement : null)
                    : extractHistoryItemTitle(item, titleSelector, linkElement instanceof HTMLAnchorElement ? linkElement : null);
                const resolvedTitle = title || `Gemini History ${index + 1}`;
                const dedupeKey = [
                    href ? `href:${href}` : '',
                    resolvedTitle.toLowerCase()
                ]
                    .filter(Boolean)
                    .join('|') || `id:${id}`;

                return {
                    id,
                    title: resolvedTitle,
                    dedupeKey,
                    hasDerivedId: Boolean(derivedId),
                    updatedAt: Date.now() - index
                };
            })
            .filter((item, itemIndex, allItems) => {
                if (!item.id.length) {
                    return false;
                }

                if (seenSearchKeys.has(item.dedupeKey)) {
                    return false;
                }

                if (!item.hasDerivedId) {
                    const hasSiblingWithDerivedId = allItems.some((candidate, candidateIndex) => {
                        return candidateIndex !== itemIndex
                            && candidate.dedupeKey === item.dedupeKey
                            && candidate.hasDerivedId;
                    });
                    if (hasSiblingWithDerivedId) {
                        return false;
                    }
                }

                if (seenIds.has(item.id)) {
                    return false;
                }

                seenSearchKeys.add(item.dedupeKey);
                seenIds.add(item.id);
                return true;
            })
            .map(({ id, title, updatedAt }) => ({
                id,
                title,
                updatedAt
            }));

        if (normalizedQuery && isGeminiSearchPath(window.location) && items.length === 0) {
            debugHistory('search-extract-empty', {
                query: normalizedQuery,
                snapshot: getHistoryDomSnapshot(config, normalizedQuery),
                searchWindow: getSearchWindowSummary(config),
                rowDiagnostics: collectSearchWindowRowDiagnostics(config)
            });
        }

        return items;
    }

    async function applyHistorySearchQuery(config: GeminiHistoryRemoteConfig, query?: string): Promise<void> {
        const normalizedQuery = normalizeSearchQuery(query);
        const { input, openedByTrigger } = await ensureSearchInputVisible(config, normalizedQuery);
        if (!input) {
            if (normalizedQuery) {
                debugHistory('search-input-missing', {
                    query: normalizedQuery,
                    inputSelector: config.selectors.historySearchInput,
                    submitSelector: config.selectors.historySearchSubmit,
                    snapshot: getHistoryDomSnapshot(config, normalizedQuery)
                });
                throw new Error('historySearchInput not found');
            }
            return;
        }

        lastSearchStabilizationState = normalizedQuery
            ? {
                query: normalizedQuery,
                baselineSignature: isGeminiSearchPath(window.location) ? getSearchWindowResultSignature(config) : '',
                acceptCurrentSignature: false
            }
            : null;

        const currentQuery = readSearchInputValue(input);
        if (currentQuery === normalizedQuery) {
            if (lastSearchStabilizationState) {
                lastSearchStabilizationState.acceptCurrentSignature = true;
            }
            debugHistory('search-skip-unchanged', {
                query: normalizedQuery,
                openedByTrigger,
                input: describeSearchInput(input),
                snapshot: getHistoryDomSnapshot(config, normalizedQuery)
            });
            return;
        }

        debugHistory('search-apply', {
            from: currentQuery,
            to: normalizedQuery,
            openedByTrigger,
            inputBefore: describeSearchInput(input),
            snapshotBefore: getHistoryDomSnapshot(config, normalizedQuery)
        });
        input.focus();

        const clearSelector = config.selectors.historySearchClear;
        const clearButton = clearSelector ? document.querySelector(clearSelector) : null;
        if (currentQuery && clearButton instanceof HTMLElement) {
            clearButton.click();
            await sleep(120);
        } else if (currentQuery) {
            setSearchInputValue(input, '');
        }

        if (normalizedQuery) {
            for (let index = 0; index < normalizedQuery.length; index += 1) {
                const partialQuery = normalizedQuery.slice(0, index + 1);
                setSearchInputValue(input, partialQuery);
                await sleep(index === normalizedQuery.length - 1 ? 120 : 70);
            }
        }

        debugHistory('search-apply-filled', {
            query: normalizedQuery,
            openedByTrigger,
            inputAfterFill: describeSearchInput(input),
            snapshotAfterFill: getHistoryDomSnapshot(config, normalizedQuery)
        });
        submitSearchInput(config, input, { preferKeyboard: openedByTrigger });
        await sleep(120);
        debugHistory('search-apply-submitted', {
            query: normalizedQuery,
            openedByTrigger,
            inputAfterSubmit: describeSearchInput(input),
            snapshotAfterSubmit: getHistoryDomSnapshot(config, normalizedQuery)
        });
    }

    async function waitForHistorySearchSettled(config: GeminiHistoryRemoteConfig, query?: string): Promise<void> {
        const normalizedQuery = normalizeSearchQuery(query);
        const input = resolveSearchInput(config);
        if (!input) {
            return;
        }

        const root = document.documentElement;
        if (!root) {
            return;
        }

        debugHistory('search-wait', {
            query: normalizedQuery,
            input: describeSearchInput(input),
            snapshot: getHistoryDomSnapshot(config, normalizedQuery)
        });
        let lastMutationAt = Date.now();
        const observer = new MutationObserver(() => {
            lastMutationAt = Date.now();
        });

        observer.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true
        });

        const startedAt = Date.now();
        try {
            while (Date.now() - startedAt < GEMINI_HISTORY_SEARCH_TIMEOUT_MS) {
                const snapshot = getHistoryDomSnapshot(config, normalizedQuery);
                const onSearchPage = Boolean(normalizedQuery) && isGeminiSearchPath(window.location);
                const searchWindowSummary = onSearchPage ? getSearchWindowSummary(config) : null;
                const currentInput = resolveSearchInput(config) ?? input;
                const inputMatchesQuery = readSearchInputValue(currentInput) === normalizedQuery;
                const currentSearchSignature = onSearchPage ? getSearchWindowResultSignature(config) : '';
                const signatureChangedFromBaseline = onSearchPage
                    && Boolean(
                        lastSearchStabilizationState
                        && lastSearchStabilizationState.query === normalizedQuery
                        && currentSearchSignature.length > 0
                        && currentSearchSignature !== lastSearchStabilizationState.baselineSignature
                    );
                const canAcceptCurrentSignature = onSearchPage
                    && Boolean(
                        lastSearchStabilizationState
                        && lastSearchStabilizationState.query === normalizedQuery
                        && lastSearchStabilizationState.acceptCurrentSignature
                        && currentSearchSignature.length > 0
                    );
                const settledBySearchPage = onSearchPage
                    && (
                        (snapshot.visibleItemMatches > 0 && (signatureChangedFromBaseline || canAcceptCurrentSignature))
                        || snapshot.searchEmptyStateMatches > 0
                    );
                if (
                    Date.now() - lastMutationAt >= GEMINI_HISTORY_SEARCH_SETTLE_DELAY_MS
                    && (
                        (!normalizedQuery && inputMatchesQuery)
                        || (normalizedQuery && !onSearchPage && inputMatchesQuery)
                        || settledBySearchPage
                    )
                ) {
                    debugHistory('search-settled', {
                        query: normalizedQuery,
                        input: describeSearchInput(input),
                        snapshot,
                        searchWindow: searchWindowSummary
                    });
                    return;
                }

                await sleep(200);
            }
        } finally {
            observer.disconnect();
        }

        debugHistory('search-timeout', {
            query: normalizedQuery,
            input: describeSearchInput(input),
            snapshot: getHistoryDomSnapshot(config, normalizedQuery),
            searchWindow: getSearchWindowSummary(config),
            rowDiagnostics: collectSearchWindowRowDiagnostics(config)
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

    async function openTemporarySearchResultDetail(
        config: GeminiHistoryRemoteConfig,
        externalId: string
    ): Promise<void> {
        const searchResultPointer = parseTemporarySearchResultId(externalId);
        if (!searchResultPointer) {
            return;
        }

        await waitForGeminiHistoryReady(config);
        await applyHistorySearchQuery(config, searchResultPointer.query);
        await waitForHistorySearchSettled(config, searchResultPointer.query);

        const items = queryHistoryItemElements(config, searchResultPointer.query);
        const target = items[searchResultPointer.index];
        if (!target) {
            throw new Error(`Gemini search result ${searchResultPointer.index} not found`);
        }

        const clickable = resolveHistoryClickableElement(target, config.selectors.historyLink);
        if (!clickable) {
            throw new Error(`Gemini search result ${searchResultPointer.index} is not clickable`);
        }

        debugHistory('detail-open-search-result', {
            externalId,
            query: searchResultPointer.query,
            index: searchResultPointer.index,
            clickable: describeElementSignature(clickable),
            beforeLocation: {
                href: window.location.href,
                pathname: window.location.pathname
            }
        });

        clickable.focus?.();
        dispatchSyntheticClick(clickable);
        clickable.click();
        const startedAt = Date.now();
        while (Date.now() - startedAt < GEMINI_HISTORY_SEARCH_TIMEOUT_MS) {
            const conversationRoot = document.querySelector(config.selectors.conversationRoot);
            const messageSelector = getCombinedMessageSelector(config);
            const messageCount = messageSelector ? document.querySelectorAll(messageSelector).length : 0;
            if (
                isGeminiAppPath(window.location)
                && !isGeminiSearchPath(window.location)
                && (conversationRoot || messageCount > 0)
            ) {
                debugHistory('detail-open-search-result-settled', {
                    externalId,
                    afterLocation: {
                        href: window.location.href,
                        pathname: window.location.pathname
                    },
                    conversationRoot: describeElementSignature(conversationRoot),
                    messageCount
                });
                await sleep(250);
                return;
            }

            await sleep(200);
        }

        debugHistory('detail-open-search-result-timeout', {
            externalId,
            afterLocation: {
                href: window.location.href,
                pathname: window.location.pathname
            },
            conversationRoot: describeElementSignature(document.querySelector(config.selectors.conversationRoot)),
            messageCount: document.querySelectorAll(getCombinedMessageSelector(config)).length
        });

        throw new Error('Gemini search result detail navigation timed out');
    }

    async function waitForGeminiConversationDetailReady(
        config: GeminiHistoryRemoteConfig,
        externalId?: string
    ): Promise<void> {
        const root = document.documentElement;
        if (!root) {
            return;
        }

        debugHistory('detail-ready-wait', {
            externalId,
            snapshot: getDetailDomSnapshot(config)
        });

        let lastMutationAt = Date.now();
        const observer = new MutationObserver(() => {
            lastMutationAt = Date.now();
        });

        observer.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true
        });

        const startedAt = Date.now();
        try {
            while (Date.now() - startedAt < GEMINI_HISTORY_DETAIL_TIMEOUT_MS) {
                const snapshot = getDetailDomSnapshot(config);
                if (
                    isGeminiAppPath(window.location)
                    && !isGeminiSearchPath(window.location)
                    && snapshot.conversationRoot
                    && snapshot.combinedMessageCount > 0
                    && Date.now() - lastMutationAt >= GEMINI_HISTORY_DETAIL_SETTLE_DELAY_MS
                ) {
                    debugHistory('detail-ready-settled', {
                        externalId,
                        snapshot
                    });
                    return;
                }

                await sleep(200);
            }
        } finally {
            observer.disconnect();
        }

        debugHistory('detail-ready-timeout', {
            externalId,
            snapshot: getDetailDomSnapshot(config)
        });
    }

    async function extractConversationDetail(config: GeminiHistoryRemoteConfig, externalId?: string): Promise<GeminiContentConversationDetail> {
        debugHistory('detail-extract-start', {
            externalId,
            snapshot: getDetailDomSnapshot(config)
        });

        if (parseTemporarySearchResultId(externalId)) {
            await openTemporarySearchResultDetail(config, externalId!);
        }

        await waitForGeminiConversationDetailReady(config, externalId);
        await maybeLoadMore(config);

        const root = document.querySelector(config.selectors.conversationRoot);
        if (!root) {
            debugHistory('detail-extract-missing-root', {
                externalId,
                snapshot: getDetailDomSnapshot(config)
            });
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
            debugHistory('detail-extract-empty-messages', {
                externalId,
                snapshot: getDetailDomSnapshot(config)
            });
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

        if (request.action === 'GET_HISTORY_LIST') {
            debugHistory('history-list-request', {
                query: request.query ?? '',
                location: {
                    href: window.location.href,
                    pathname: window.location.pathname
                },
                configVersion: request.config.version,
                selectors: {
                    historySearchInput: request.config.selectors.historySearchInput,
                    historySearchSubmit: request.config.selectors.historySearchSubmit,
                    historySearchResultContainer: request.config.selectors.historySearchResultContainer,
                    historySearchResultItem: request.config.selectors.historySearchResultItem,
                    historySearchEmptyState: request.config.selectors.historySearchEmptyState
                }
            });
        } else if (request.action === 'GET_HISTORY_DETAIL') {
            debugHistory('detail-request', {
                externalId: request.externalId,
                configVersion: request.config.version,
                snapshot: getDetailDomSnapshot(request.config)
            });
        }

        if (!request.config.matchOrigins.includes(window.location.origin)) {
            if (request.action === 'GET_HISTORY_DETAIL') {
                debugHistory('detail-origin-mismatch', {
                    externalId: request.externalId,
                    origin: window.location.origin,
                    matchOrigins: request.config.matchOrigins,
                    snapshot: getDetailDomSnapshot(request.config)
                });
            }
            return createError('AUTH_REQUIRED', '当前标签页不在 Gemini 站点上下文中。');
        }

        if (request.action === 'GET_HISTORY_LIST') {
            await waitForGeminiHistoryReady(request.config);
        }

        if (isAuthRequired(request.config)) {
            if (request.action === 'GET_HISTORY_DETAIL') {
                debugHistory('detail-auth-required', {
                    externalId: request.externalId,
                    snapshot: getDetailDomSnapshot(request.config)
                });
            }
            return createError('AUTH_REQUIRED', 'Gemini 页面当前未登录。');
        }

        if (request.action === 'GET_HISTORY_LIST' && shouldTreatMissingHistoryScaffoldAsAuthRequired(request.config, {
            bodyText: document.body?.innerText ?? ''
        })) {
            return createError('AUTH_REQUIRED', 'Gemini 页面当前未登录。');
        }

        const shouldDeferDetailHealthCheck = request.action === 'GET_HISTORY_DETAIL' && Boolean(parseTemporarySearchResultId(request.externalId));
        const healthCheckResult = shouldDeferDetailHealthCheck ? null : await runHealthCheck(request);
        if (healthCheckResult) {
            if (request.action === 'GET_HISTORY_DETAIL') {
                debugHistory('detail-health-check-result', {
                    externalId: request.externalId,
                    shouldDeferDetailHealthCheck,
                    snapshot: getDetailDomSnapshot(request.config),
                    error: healthCheckResult
                });
            }
            return healthCheckResult;
        }

        try {
            if (request.action === 'GET_HISTORY_LIST') {
                await applyHistorySearchQuery(request.config, request.query);
                await waitForHistorySearchSettled(request.config, request.query);
                return {
                    ok: true,
                    data: extractHistoryList(request.config, request.query)
                };
            }

            if (request.action === 'GET_HISTORY_DETAIL') {
                const data = await extractConversationDetail(request.config, request.externalId);
                if (shouldDeferDetailHealthCheck) {
                    const detailHealthCheckResult = await runHealthCheck(request);
                    if (detailHealthCheckResult) {
                        debugHistory('detail-post-navigation-health-check-result', {
                            externalId: request.externalId,
                            snapshot: getDetailDomSnapshot(request.config),
                            error: detailHealthCheckResult
                        });
                        return detailHealthCheckResult;
                    }
                }
                return {
                    ok: true,
                    data
                };
            }

            return createError('UNKNOWN', `Unsupported Gemini content action: ${request.action}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Gemini DOM scraping failed';
            if (request.action === 'GET_HISTORY_DETAIL') {
                debugHistory('detail-request-failed', {
                    externalId: request.externalId,
                    message,
                    snapshot: getDetailDomSnapshot(request.config)
                });
            }
            return createError(request.action === 'GET_HISTORY_LIST' ? 'SELECTOR_MISMATCH' : 'DETAIL_NOT_FOUND', message);
        }
    }

    return {
        handleRequest,
        extractHistoryList,
        applyHistorySearchQuery,
        waitForHistorySearchSettled,
        hasGeminiHistoryScaffold,
        isAuthRequired,
        shouldTreatMissingHistoryScaffoldAsAuthRequired
    };
}
