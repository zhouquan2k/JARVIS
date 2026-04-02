// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeminiHistoryRemoteConfig } from '@packages/core/src';
import type { GeminiContentRequest } from '@packages/core/src';

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
        requiredSelectors: ['historyListContainer', 'historyListItem'],
        maxMissingCount: 1
    }
};

async function loadModule() {
    vi.stubGlobal('defineContentScript', (definition: unknown) => definition);
    return import('../../entrypoints/gemini-history.content');
}

describe('gemini-history.content', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        document.body.innerHTML = '';
    });

    it('returns recent Gemini history when query is empty', async () => {
        document.body.innerHTML = `
            <div class="history-list">
                <a class="history-item" href="https://gemini.google.com/app/recent-1">
                    <span class="conversation-title">Recent Gemini Chat</span>
                </a>
            </div>
            <main></main>
        `;
        const { handleRequest } = await loadModule();

        const response = await handleRequest({
            action: 'GET_HISTORY_LIST',
            config: CONFIG,
            query: ''
        } satisfies GeminiContentRequest);

        expect(response).toEqual({
            ok: true,
            data: [
                {
                    id: 'recent-1',
                    title: 'Recent Gemini Chat',
                    updatedAt: expect.any(Number)
                }
            ]
        });
    });

    it('applies non-empty query and returns searched Gemini history results', async () => {
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
        const { handleRequest } = await loadModule();

        const response = await handleRequest({
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
        expect((document.querySelector('input') as HTMLInputElement).value).toBe('incident');
    });

    it('opens a launcher and searches through a contenteditable Gemini search box', async () => {
        document.body.innerHTML = `
            <div class="history-list"></div>
            <button type="button" aria-label="Search"></button>
            <div class="search-results"></div>
            <main></main>
        `;
        const submitButton = document.querySelector('button') as HTMLButtonElement;
        submitButton.addEventListener('click', () => {
            if (!document.querySelector('[role="searchbox"]')) {
                const searchbox = document.createElement('div');
                searchbox.setAttribute('role', 'searchbox');
                searchbox.setAttribute('contenteditable', 'true');
                document.body.appendChild(searchbox);
                return;
            }

            window.setTimeout(() => {
                const results = document.querySelector('.search-results');
                if (results) {
                    results.innerHTML = `
                        <a class="search-result" href="https://gemini.google.com/app/search-2">
                            <span class="conversation-title">Agent Search Result</span>
                        </a>
                    `;
                }
            }, 0);
        });
        const { handleRequest } = await loadModule();

        const response = await handleRequest({
            action: 'GET_HISTORY_LIST',
            config: {
                ...CONFIG,
                selectors: {
                    ...CONFIG.selectors,
                    historySearchInput: '[role="searchbox"]'
                }
            },
            query: 'agent'
        } satisfies GeminiContentRequest);

        expect(response).toEqual({
            ok: true,
            data: [
                {
                    id: 'search-2',
                    title: 'Agent Search Result',
                    updatedAt: expect.any(Number)
                }
            ]
        });
        expect(document.querySelector('[role="searchbox"]')?.textContent).toBe('agent');
    });

    it('uses Enter to submit after opening the search launcher instead of clicking the launcher twice', async () => {
        document.body.innerHTML = `
            <div class="history-list">
                <a class="history-item" href="https://gemini.google.com/app/recent-1">
                    <span class="conversation-title">Recent Gemini Chat</span>
                </a>
            </div>
            <button type="button" aria-label="Search"></button>
            <div class="search-results"></div>
            <main></main>
        `;
        const submitButton = document.querySelector('button') as HTMLButtonElement;
        let launcherClicks = 0;
        submitButton.addEventListener('click', () => {
            launcherClicks += 1;
            if (launcherClicks === 1) {
                const searchbox = document.createElement('div');
                searchbox.setAttribute('role', 'searchbox');
                searchbox.setAttribute('contenteditable', 'true');
                searchbox.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        const results = document.querySelector('.search-results');
                        if (results) {
                            results.innerHTML = `
                                <a class="search-result" href="https://gemini.google.com/app/search-enter-2">
                                    <span class="conversation-title">Enter Search Result</span>
                                </a>
                            `;
                        }
                    }
                });
                document.body.appendChild(searchbox);
            }
        });
        const { handleRequest } = await loadModule();

        const response = await handleRequest({
            action: 'GET_HISTORY_LIST',
            config: {
                ...CONFIG,
                selectors: {
                    ...CONFIG.selectors,
                    historySearchInput: '[role="searchbox"]'
                }
            },
            query: 'enter'
        } satisfies GeminiContentRequest);

        expect(launcherClicks).toBe(1);
        expect(response).toEqual({
            ok: true,
            data: [
                {
                    id: 'search-enter-2',
                    title: 'Enter Search Result',
                    updatedAt: expect.any(Number)
                }
            ]
        });
    });

    it('returns an empty list when the search yields no Gemini history matches', async () => {
        document.body.innerHTML = `
            <div class="history-list"></div>
            <input type="search" aria-label="Search" />
            <button type="button" aria-label="Search"></button>
            <div class="search-results"></div>
            <main></main>
        `;
        const { handleRequest } = await loadModule();

        const response = await handleRequest({
            action: 'GET_HISTORY_LIST',
            config: CONFIG,
            query: 'no-match'
        } satisfies GeminiContentRequest);

        expect(response).toEqual({
            ok: true,
            data: []
        });
    });

    it('maps missing search input to a standard selector mismatch error', async () => {
        document.body.innerHTML = `
            <div class="history-list"></div>
            <main></main>
        `;
        const { handleRequest } = await loadModule();

        const response = await handleRequest({
            action: 'GET_HISTORY_LIST',
            config: CONFIG,
            query: 'incident'
        } satisfies GeminiContentRequest);

        expect(response).toEqual({
            ok: false,
            error: {
                code: 'SELECTOR_MISMATCH',
                message: expect.any(String)
            }
        });
    });
});
