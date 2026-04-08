// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGeminiDomScraper } from './geminiDomScraper';
import type { GeminiHistoryRemoteConfig } from '../../../interfaces/ProviderRemoteConfig';
import type { GeminiContentRequest } from './geminiContentProtocol';

const CONFIG: GeminiHistoryRemoteConfig = {
    providerId: 'gemini-web',
    version: 'test-1',
    matchOrigins: ['https://gemini.google.com'],
    selectors: {
        historyListContainer: '.history-list',
        historyListItem: '.history-item',
        historyTitle: '.conversation-title',
        historyLink: 'a',
        historySearchInput: 'input[type="search"]',
        historySearchSubmit: 'button[aria-label="Search"]',
        historySearchResultItem: '.search-result',
        historySearchResultCount: '[data-test-id="result-count"]',
        conversationRoot: 'main',
        userBubble: '.user',
        assistantBubble: '.assistant'
    },
    healthCheck: {
        requiredSelectors: ['historyListContainer', 'historyListItem', 'conversationRoot', 'userBubble', 'assistantBubble'],
        maxMissingCount: 1
    }
};

function mockGeminiLocation(pathname: string) {
    return vi.spyOn(window, 'location', 'get').mockReturnValue({
        pathname,
        hostname: 'gemini.google.com',
        href: `https://gemini.google.com${pathname}`,
        origin: 'https://gemini.google.com'
    } as Location);
}

describe('createGeminiDomScraper', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        document.body.innerHTML = '';
    });

    it('supports Gemini history search through the shared scraper', async () => {
        mockGeminiLocation('/app');
        document.body.innerHTML = `
            <div class="history-list"></div>
            <input type="search" aria-label="Search" />
            <button type="button" aria-label="Search"></button>
            <div class="search-results"></div>
            <main></main>
        `;

        const submitButton = document.querySelector('button') as HTMLButtonElement;
        submitButton.addEventListener('click', () => {
            window.setTimeout(() => {
                const results = document.querySelector('.search-results');
                if (results) {
                    results.innerHTML = `
                        <a class="search-result" href="https://gemini.google.com/app/search-1">
                            <span class="conversation-title">Incident Search Result</span>
                        </a>
                    `;
                }
            }, 0);
        });

        const scraper = createGeminiDomScraper();
        const response = await scraper.handleRequest({
            action: 'GET_HISTORY_LIST',
            config: CONFIG,
            query: 'incident'
        } satisfies GeminiContentRequest);

        expect(response).toEqual({
            ok: true,
            data: [
                {
                    id: 'search-1',
                    title: 'Incident Search Result',
                    updatedAt: expect.any(Number)
                }
            ]
        });
    });

    it('waits for delayed Gemini detail messages before extracting conversation detail', async () => {
        mockGeminiLocation('/app/delayed-1');
        document.body.innerHTML = `
            <main></main>
        `;

        window.setTimeout(() => {
            const main = document.querySelector('main');
            if (main) {
                main.innerHTML = `
                    <div class="user">你好</div>
                    <div class="assistant">已收到</div>
                `;
            }
        }, 100);

        const scraper = createGeminiDomScraper();
        const response = await scraper.handleRequest({
            action: 'GET_HISTORY_DETAIL',
            config: CONFIG,
            externalId: 'delayed-1'
        } satisfies GeminiContentRequest);

        expect(response.ok).toBe(true);
        expect(response).toEqual({
            ok: true,
            data: {
                id: 'delayed-1',
                title: 'Gemini Conversation',
                updatedAt: expect.any(Number),
                messages: [
                    {
                        id: 'delayed-1-1',
                        role: 'user',
                        content: '你好'
                    },
                    {
                        id: 'delayed-1-2',
                        role: 'assistant',
                        content: '已收到'
                    }
                ]
            }
        });
    });

    it('keeps waiting for Gemini search results until the rendered count matches the page count', async () => {
        mockGeminiLocation('/search');
        document.body.innerHTML = `
            <div class="history-list"></div>
            <input type="search" aria-label="Search" />
            <button type="button" aria-label="Search">Search</button>
            <main>
                <search-window>
                    <div data-test-id="result-count">6 results</div>
                    <div class="search-results">
                        <a class="search-result" href="https://gemini.google.com/app/search-6">
                            <span class="conversation-title">Last Result Only</span>
                        </a>
                    </div>
                    <button data-test-id="history-load-more" type="button">Load more</button>
                </search-window>
            </main>
        `;

        const loadMore = document.querySelector('[data-test-id="history-load-more"]') as HTMLButtonElement;
        loadMore.addEventListener('click', () => {
            const results = document.querySelector('.search-results');
            if (results && results.children.length === 1) {
                setTimeout(() => {
                    results.innerHTML = `
                        <a class="search-result" href="https://gemini.google.com/app/search-1"><span class="conversation-title">Result 1</span></a>
                        <a class="search-result" href="https://gemini.google.com/app/search-2"><span class="conversation-title">Result 2</span></a>
                        <a class="search-result" href="https://gemini.google.com/app/search-3"><span class="conversation-title">Result 3</span></a>
                        <a class="search-result" href="https://gemini.google.com/app/search-4"><span class="conversation-title">Result 4</span></a>
                        <a class="search-result" href="https://gemini.google.com/app/search-5"><span class="conversation-title">Result 5</span></a>
                        <a class="search-result" href="https://gemini.google.com/app/search-6"><span class="conversation-title">Result 6</span></a>
                    `;
                }, 60);
            }
        });

        const scraper = createGeminiDomScraper();
        const response = await scraper.handleRequest({
            action: 'GET_HISTORY_LIST',
            config: {
                ...CONFIG,
                selectors: {
                    ...CONFIG.selectors,
                    historySearchResultContainer: 'search-window',
                    lazyLoadSentinel: '[data-test-id="history-load-more"]'
                }
            },
            query: 'incident'
        } satisfies GeminiContentRequest);

        expect(response).toEqual({
            ok: true,
            data: [
                { id: 'search-1', title: 'Result 1', updatedAt: expect.any(Number) },
                { id: 'search-2', title: 'Result 2', updatedAt: expect.any(Number) },
                { id: 'search-3', title: 'Result 3', updatedAt: expect.any(Number) },
                { id: 'search-4', title: 'Result 4', updatedAt: expect.any(Number) },
                { id: 'search-5', title: 'Result 5', updatedAt: expect.any(Number) },
                { id: 'search-6', title: 'Result 6', updatedAt: expect.any(Number) }
            ]
        });
    });

});
