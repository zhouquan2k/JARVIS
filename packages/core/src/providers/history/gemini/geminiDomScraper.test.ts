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
});
