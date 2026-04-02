// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
    contextBridge: {
        exposeInMainWorld: vi.fn()
    }
}));

import {
    applyHistorySearchQuery,
    extractHistoryList,
    handleGeminiHistoryRequestForTest,
    hasGeminiHistoryScaffold,
    isAuthRequired,
    shouldTreatMissingHistoryScaffoldAsAuthRequired,
    waitForHistorySearchSettled
} from './gemini-history.preload';
import type { GeminiHistoryRemoteConfig } from '@packages/core/src';

const CONFIG: GeminiHistoryRemoteConfig = {
    providerId: 'gemini-web',
    version: 'test-1',
    matchOrigins: ['https://gemini.google.com'],
    selectors: {
        historyListContainer: 'conversations-list[data-test-id="all-conversations"]',
        historyListItem: 'a[data-test-id="conversation"]',
        historyTitle: '.conversation-title',
        historyLink: 'a[data-test-id="conversation"]',
        conversationRoot: 'main',
        userBubble: 'user-query',
        assistantBubble: 'model-response',
        lazyLoadSentinel: '[data-test-id="history-load-more"]',
        loginGate: 'form[action*="ServiceLogin"]'
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

describe('gemini-history.preload auth detection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '';
    });

    it('does not treat Gemini app transition pages with account links as auth required when explicit login signals are absent', () => {
        const querySelector = vi.fn((selector: string) => {
            if (selector === 'a[href*="accounts.google.com"], form[action*="accounts.google.com"]') {
                return {} as Element;
            }

            return null;
        });

        expect(isAuthRequired(CONFIG, {
            querySelector,
            location: {
                pathname: '/app',
                hostname: 'gemini.google.com'
            },
            bodyText: ''
        })).toBe(false);
    });

    it('does not treat accounts.google.com links as auth required when history scaffold already exists', () => {
        const querySelector = vi.fn((selector: string) => {
            if (selector === 'a[href*="accounts.google.com"], form[action*="accounts.google.com"]') {
                return {} as Element;
            }

            if (selector === CONFIG.selectors.historyListContainer) {
                return {} as Element;
            }

            return null;
        });

        expect(isAuthRequired(CONFIG, {
            querySelector,
            location: {
                pathname: '/app',
                hostname: 'gemini.google.com'
            },
            bodyText: ''
        })).toBe(false);
    });

    it('still treats Google account login pages as auth required when history scaffold is missing', () => {
        const querySelector = vi.fn((selector: string) => {
            if (selector === 'a[href*="accounts.google.com"], form[action*="accounts.google.com"]') {
                return {} as Element;
            }

            return null;
        });

        expect(isAuthRequired(CONFIG, {
            querySelector,
            location: {
                pathname: '/v3/signin/identifier',
                hostname: 'accounts.google.com'
            },
            bodyText: ''
        })).toBe(true);
    });

    it('does not treat a logged-in empty history state as auth required when the list scaffold exists', () => {
        const querySelector = vi.fn((selector: string) => {
            if (selector === CONFIG.selectors.historyListContainer) {
                return {} as Element;
            }

            return null;
        });

        expect(hasGeminiHistoryScaffold(CONFIG, querySelector)).toBe(true);
        expect(shouldTreatMissingHistoryScaffoldAsAuthRequired(CONFIG, {
            querySelector,
            location: {
                pathname: '/app',
                hostname: 'gemini.google.com'
            },
            bodyText: ''
        })).toBe(false);
    });

    it('treats a missing history scaffold as auth required even without an explicit sign-in prompt', () => {
        expect(shouldTreatMissingHistoryScaffoldAsAuthRequired(CONFIG, {
            querySelector: () => null,
            location: {
                pathname: '/v3/signin/identifier',
                hostname: 'accounts.google.com'
            },
            bodyText: ''
        })).toBe(true);
    });

    it('does not treat a Gemini app transition page without explicit login signals as auth required only because the scaffold is missing', () => {
        expect(shouldTreatMissingHistoryScaffoldAsAuthRequired(CONFIG, {
            querySelector: () => null,
            location: {
                pathname: '/app',
                hostname: 'gemini.google.com'
            },
            bodyText: ''
        })).toBe(false);
    });

    it('applies search input, waits for result list settlement and extracts search results', async () => {
        document.body.innerHTML = `
            <div class="history-list"></div>
            <input type="search" aria-label="Search history" />
            <button type="button" aria-label="Search"></button>
            <div class="search-results"></div>
        `;
        const input = document.querySelector('input') as HTMLInputElement;
        const submitButton = document.querySelector('button') as HTMLButtonElement;
        submitButton.addEventListener('click', () => {
            window.setTimeout(() => {
                const results = document.querySelector('.search-results');
                if (results) {
                    results.innerHTML = `
                        <a class="search-result" href="https://gemini.google.com/app/remote-1">
                            <span class="conversation-title">Incident Search Result</span>
                        </a>
                    `;
                }
            }, 0);
        });

        const searchConfig: GeminiHistoryRemoteConfig = {
            ...CONFIG,
            selectors: {
                ...CONFIG.selectors,
                historySearchInput: 'input[type="search"]',
                historySearchSubmit: 'button[aria-label="Search"]',
                historySearchResultItem: '.search-result'
            }
        };

        await applyHistorySearchQuery(searchConfig, 'incident');
        await waitForHistorySearchSettled(searchConfig, 'incident');

        expect(input.value).toBe('incident');
        expect(extractHistoryList(searchConfig, 'incident')).toEqual([
            {
                id: 'remote-1',
                title: 'Incident Search Result',
                updatedAt: expect.any(Number)
            }
        ]);
    });

    it('opens a search launcher and writes into a contenteditable Gemini search box', async () => {
        document.body.innerHTML = `
            <div class="history-list"></div>
            <button type="button" aria-label="Search"></button>
            <div class="search-results"></div>
        `;
        const submitButton = document.querySelector('button') as HTMLButtonElement;
        submitButton.addEventListener('click', () => {
            if (!document.querySelector('[role="searchbox"]')) {
                const searchbox = document.createElement('div');
                searchbox.setAttribute('role', 'searchbox');
                searchbox.setAttribute('contenteditable', 'true');
                searchbox.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        const results = document.querySelector('.search-results');
                        if (results) {
                            results.innerHTML = `
                                <a class="search-result" href="https://gemini.google.com/app/remote-2">
                                    <span class="conversation-title">Agent Result</span>
                                </a>
                            `;
                        }
                    }
                });
                document.body.appendChild(searchbox);
                return;
            }
        });

        const searchConfig: GeminiHistoryRemoteConfig = {
            ...CONFIG,
            selectors: {
                ...CONFIG.selectors,
                historySearchInput: '[role="searchbox"]',
                historySearchSubmit: 'button[aria-label="Search"]',
                historySearchResultItem: '.search-result'
            }
        };

        await applyHistorySearchQuery(searchConfig, 'agent');
        await waitForHistorySearchSettled(searchConfig, 'agent');

        expect(document.querySelector('[role="searchbox"]')?.textContent).toBe('agent');
        expect(extractHistoryList(searchConfig, 'agent')).toEqual([
            {
                id: 'remote-2',
                title: 'Agent Result',
                updatedAt: expect.any(Number)
            }
        ]);
    });

    it('submits with Enter after opening the search launcher instead of clicking the same launcher twice', async () => {
        document.body.innerHTML = `
            <div class="history-list">
                <a class="history-item" href="https://gemini.google.com/app/recent-1">
                    <span class="conversation-title">Recent Gemini Chat</span>
                </a>
            </div>
            <button type="button" aria-label="Search"></button>
            <div class="search-results"></div>
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
                                <a class="search-result" href="https://gemini.google.com/app/search-enter-1">
                                    <span class="conversation-title">Enter Search Result</span>
                                </a>
                            `;
                        }
                    }
                });
                document.body.appendChild(searchbox);
            }
        });

        const searchConfig: GeminiHistoryRemoteConfig = {
            ...CONFIG,
            selectors: {
                ...CONFIG.selectors,
                historySearchInput: '[role="searchbox"]',
                historySearchSubmit: 'button[aria-label="Search"]',
                historySearchResultItem: '.search-result'
            }
        };

        await applyHistorySearchQuery(searchConfig, 'enter');
        await waitForHistorySearchSettled(searchConfig, 'enter');

        expect(launcherClicks).toBe(1);
        expect(extractHistoryList(searchConfig, 'enter')).toEqual([
            {
                id: 'search-enter-1',
                title: 'Enter Search Result',
                updatedAt: expect.any(Number)
            }
        ]);
    });

    it('ignores the Gemini prompt composer and prefers the dedicated history search input', async () => {
        document.body.innerHTML = `
            <div role="textbox" contenteditable="true" aria-label="为 Gemini 输入提示"></div>
            <button type="button" aria-label="Search"></button>
        `;
        const launcher = document.querySelector('button') as HTMLButtonElement;
        launcher.addEventListener('click', () => {
            if (!document.querySelector('input[aria-label="搜索对话"]')) {
                const input = document.createElement('input');
                input.type = 'text';
                input.setAttribute('aria-label', '搜索对话');
                document.body.appendChild(input);
            }
        });

        const searchConfig: GeminiHistoryRemoteConfig = {
            ...CONFIG,
            selectors: {
                ...CONFIG.selectors,
                historySearchInput: '[role="textbox"][contenteditable="true"], input[aria-label="搜索对话"]',
                historySearchSubmit: 'button[aria-label="Search"]'
            }
        };

        await applyHistorySearchQuery(searchConfig, '九宫格');

        expect(document.querySelector('[role="textbox"]')?.textContent).toBe('');
        expect((document.querySelector('input[aria-label="搜索对话"]') as HTMLInputElement).value).toBe('九宫格');
    });

    it('extracts /search result rows from non-anchor router link elements and does not mix recent conversation links', () => {
        const locationSpy = mockGeminiLocation('/search');
        document.body.innerHTML = `
            <nav aria-label="Chat history">
                <a data-test-id="conversation" href="https://gemini.google.com/app/recent-1">
                    <span class="conversation-title">Recent Gemini Chat</span>
                </a>
            </nav>
            <input type="text" aria-label="搜索对话" value="" />
            <main>
                <search-window>
                    <div>
                        <div>
                            <article ng-reflect-router-link="/app/search-1">
                                <div class="conversation-title">
                                    <span class="conversation-title">Incident Search Result</span>
                                </div>
                            </article>
                        </div>
                    </div>
                </search-window>
            </main>
        `;

        const searchConfig: GeminiHistoryRemoteConfig = {
            ...CONFIG,
            selectors: {
                ...CONFIG.selectors,
                historySearchInput: 'input[aria-label="搜索对话"]',
                historySearchResultContainer: 'search-window',
                historySearchResultItem: '[ng-reflect-router-link*="/app/"]'
            }
        };

        expect(extractHistoryList(searchConfig, 'incident')).toEqual([
            {
                id: 'search-1',
                title: 'Incident Search Result',
                updatedAt: expect.any(Number)
            }
        ]);
        locationSpy.mockRestore();
    });

    it('returns temporary search result ids for clickable /search rows without router hrefs', async () => {
        const locationSpy = mockGeminiLocation('/search');
        document.body.innerHTML = `
            <input type="text" aria-label="搜索对话" value="九宫格" />
            <main>
                <search-window>
                    <div class="search-window-container">
                        <div role="option" class="conversation-container ng-star-inserted">
                            <span class="conversation-title">请将以上9张图片做成九宫格的一张图片</span>
                            <span class="conversation-summary">这是一段不应该进入标题的摘要内容</span>
                        </div>
                    </div>
                </search-window>
            </main>
        `;

        const searchConfig: GeminiHistoryRemoteConfig = {
            ...CONFIG,
            selectors: {
                ...CONFIG.selectors,
                historySearchInput: 'input[aria-label="搜索对话"]',
                historySearchResultContainer: 'search-window',
                historySearchResultItem: '[data-test-id="search-result"]'
            }
        };

        expect(extractHistoryList(searchConfig, '九宫格')).toEqual([
            {
                id: 'gemini-search-result:%E4%B9%9D%E5%AE%AB%E6%A0%BC:0',
                title: '请将以上9张图片做成九宫格的一张图片',
                updatedAt: expect.any(Number)
            }
        ]);

        locationSpy.mockRestore();
    });

    it('prefers a title-like node over summary content for /search rows even when config title selector misses', async () => {
        const locationSpy = mockGeminiLocation('/search');
        document.body.innerHTML = `
            <input type="text" aria-label="搜索对话" value="九宫格" />
            <main>
                <search-window>
                    <div class="search-window-container">
                        <div role="option" class="conversation-container ng-star-inserted">
                            <div class="search-result-heading">真正标题</div>
                            <div class="conversation-summary">这里是不应出现在标题中的摘要正文</div>
                        </div>
                    </div>
                </search-window>
            </main>
        `;

        const searchConfig: GeminiHistoryRemoteConfig = {
            ...CONFIG,
            selectors: {
                ...CONFIG.selectors,
                historyTitle: '.non-existent-title',
                historySearchInput: 'input[aria-label="搜索对话"]',
                historySearchResultContainer: 'search-window',
                historySearchResultItem: '[data-test-id="search-result"]'
            }
        };

        expect(extractHistoryList(searchConfig, '九宫格')).toEqual([
            {
                id: 'gemini-search-result:%E4%B9%9D%E5%AE%AB%E6%A0%BC:0',
                title: '真正标题',
                updatedAt: expect.any(Number)
            }
        ]);

        locationSpy.mockRestore();
    });

    it('deduplicates the same /search conversation when both real and temporary ids are discoverable', async () => {
        const locationSpy = mockGeminiLocation('/search');
        document.body.innerHTML = `
            <input type="text" aria-label="搜索对话" value="九宫格" />
            <main>
                <search-window>
                    <div class="search-window-container">
                        <article ng-reflect-router-link="/app/search-1">
                            <span class="conversation-title">重复的搜索结果</span>
                        </article>
                        <div role="option" class="conversation-container ng-star-inserted">
                            <span class="conversation-title">重复的搜索结果</span>
                            <a href="https://gemini.google.com/app/search-1" hidden>hidden link</a>
                        </div>
                    </div>
                </search-window>
            </main>
        `;

        const searchConfig: GeminiHistoryRemoteConfig = {
            ...CONFIG,
            selectors: {
                ...CONFIG.selectors,
                historySearchInput: 'input[aria-label="搜索对话"]',
                historySearchResultContainer: 'search-window',
                historySearchResultItem: '[ng-reflect-router-link*="/app/"], [role="option"]'
            }
        };

        expect(extractHistoryList(searchConfig, '九宫格')).toEqual([
            {
                id: 'search-1',
                title: '重复的搜索结果',
                updatedAt: expect.any(Number)
            }
        ]);

        locationSpy.mockRestore();
    });

    it('waits for the final full-query result set instead of returning the initial default search rows', async () => {
        const locationSpy = mockGeminiLocation('/search');
        document.body.innerHTML = `
            <input type="text" aria-label="搜索对话" value="" />
            <main>
                <search-window>
                    <div class="search-window-container">
                        <div role="option" class="conversation-container ng-star-inserted">
                            <span class="conversation-title">默认结果一</span>
                        </div>
                    </div>
                </search-window>
            </main>
        `;

        const searchInput = document.querySelector('input[aria-label="搜索对话"]') as HTMLInputElement;
        searchInput.addEventListener('input', () => {
            if (searchInput.value === '九宫格') {
                setTimeout(() => {
                    const container = document.querySelector('search-window .search-window-container');
                    if (container) {
                        container.innerHTML = `
                            <div role="option" class="conversation-container ng-star-inserted">
                                <span class="conversation-title">请将以上9张图片做成九宫格的一张图片</span>
                            </div>
                        `;
                    }
                }, 80);
            }
        });

        const searchConfig: GeminiHistoryRemoteConfig = {
            ...CONFIG,
            selectors: {
                ...CONFIG.selectors,
                historySearchInput: 'input[aria-label="搜索对话"]',
                historySearchResultContainer: 'search-window',
                historySearchResultItem: '[data-test-id="search-result"]'
            }
        };

        await applyHistorySearchQuery(searchConfig, '九宫格');
        await waitForHistorySearchSettled(searchConfig, '九宫格');

        expect(extractHistoryList(searchConfig, '九宫格')).toEqual([
            {
                id: 'gemini-search-result:%E4%B9%9D%E5%AE%AB%E6%A0%BC:0',
                title: '请将以上9张图片做成九宫格的一张图片',
                updatedAt: expect.any(Number)
            }
        ]);

        locationSpy.mockRestore();
    });

    it('suppresses /search results when the final stable list still matches the default rows', async () => {
        const locationSpy = mockGeminiLocation('/search');
        document.body.innerHTML = `
            <input type="text" aria-label="搜索对话" value="" />
            <main>
                <search-window>
                    <div class="search-window-container">
                        <div role="option" class="conversation-container ng-star-inserted">
                            <span class="conversation-title">默认结果一</span>
                        </div>
                    </div>
                </search-window>
            </main>
        `;

        const searchConfig: GeminiHistoryRemoteConfig = {
            ...CONFIG,
            selectors: {
                ...CONFIG.selectors,
                historySearchInput: 'input[aria-label="搜索对话"]',
                historySearchResultContainer: 'search-window',
                historySearchResultItem: '[data-test-id="search-result"]'
            }
        };

        await applyHistorySearchQuery(searchConfig, '九宫格');

        expect(extractHistoryList(searchConfig, '九宫格')).toEqual([]);

        locationSpy.mockRestore();
    });

    it('treats /search empty state as a settled empty result set', async () => {
        const locationSpy = mockGeminiLocation('/search');
        document.body.innerHTML = `
            <input type="text" aria-label="搜索对话" value="" />
            <main>
                <search-window>
                    <div data-test-id="empty-state">No results</div>
                </search-window>
            </main>
        `;

        const searchConfig: GeminiHistoryRemoteConfig = {
            ...CONFIG,
            selectors: {
                ...CONFIG.selectors,
                historySearchInput: 'input[aria-label="搜索对话"]',
                historySearchResultContainer: 'search-window',
                historySearchResultItem: '[ng-reflect-router-link*="/app/"]',
                historySearchEmptyState: 'search-window [data-test-id="empty-state"]'
            }
        };

        await waitForHistorySearchSettled(searchConfig, 'missing');

        expect(extractHistoryList(searchConfig, 'missing')).toEqual([]);
        locationSpy.mockRestore();
    });

    it('returns temporary ids for search-window rows without extractable history links', async () => {
        const locationSpy = mockGeminiLocation('/search');
        const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        document.body.innerHTML = `
            <input type="text" aria-label="搜索对话" value="" />
            <main>
                <search-window>
                    <div class="search-window-container">
                        <article data-row-id="row-1">
                            <button aria-label="打开结果">
                                <span>请将以上9张图片做成九宫格的一张图片</span>
                            </button>
                        </article>
                    </div>
                </search-window>
            </main>
        `;

        const searchConfig: GeminiHistoryRemoteConfig = {
            ...CONFIG,
            selectors: {
                ...CONFIG.selectors,
                historySearchInput: 'input[aria-label="搜索对话"]',
                historySearchResultContainer: 'search-window',
                historySearchResultItem: '[data-test-id="search-result"]'
            }
        };

        expect(extractHistoryList(searchConfig, '九宫格')).toEqual([
            {
                id: 'gemini-search-result:%E4%B9%9D%E5%AE%AB%E6%A0%BC:0',
                title: '请将以上9张图片做成九宫格的一张图片',
                updatedAt: expect.any(Number)
            }
        ]);
        const diagnosticLog = consoleSpy.mock.calls
            .map((call) => String(call[0]))
            .find((line) => line.includes('search-window-diagnostics'));
        expect(diagnosticLog).toBeUndefined();

        consoleSpy.mockRestore();
        locationSpy.mockRestore();
    });

    it('opens a temporary search result and waits for delayed detail rendering before extracting messages', async () => {
        const locationState = {
            pathname: '/search',
            hostname: 'gemini.google.com',
            href: 'https://gemini.google.com/search',
            origin: 'https://gemini.google.com'
        };
        vi.spyOn(window, 'location', 'get').mockImplementation(() => locationState as Location);
        document.body.innerHTML = `
            <input type="text" aria-label="搜索对话" value="九宫格" />
            <main>
                <search-window>
                    <div class="search-window-container">
                        <div role="option" class="conversation-container ng-star-inserted">
                            <span class="conversation-title">请将以上9张图片做成九宫格的一张图片</span>
                        </div>
                    </div>
                </search-window>
            </main>
        `;

        const option = document.querySelector('[role="option"]') as HTMLDivElement;
        option.addEventListener('click', () => {
            setTimeout(() => {
                locationState.pathname = '/app/search-1';
                locationState.href = 'https://gemini.google.com/app/search-1';
                document.body.innerHTML = `
                    <main>
                        <div class="chat-app-shell">loading</div>
                    </main>
                `;
                setTimeout(() => {
                    document.body.innerHTML = `
                        <main>
                            <user-query>用户消息</user-query>
                            <model-response>助手消息</model-response>
                        </main>
                    `;
                }, 100);
            }, 100);
        });

        const searchConfig: GeminiHistoryRemoteConfig = {
            ...CONFIG,
            selectors: {
                ...CONFIG.selectors,
                historySearchInput: 'input[aria-label="搜索对话"]',
                historySearchResultContainer: 'search-window',
                historySearchResultItem: '[data-test-id="search-result"]'
            }
        };

        const response = await handleGeminiHistoryRequestForTest({
            action: 'GET_HISTORY_DETAIL',
            config: searchConfig,
            externalId: 'gemini-search-result:%E4%B9%9D%E5%AE%AB%E6%A0%BC:0'
        });

        expect(response).toEqual({
            ok: true,
            data: {
                id: 'gemini-search-result:%E4%B9%9D%E5%AE%AB%E6%A0%BC:0',
                title: 'Gemini Conversation',
                updatedAt: expect.any(Number),
                messages: [
                    { id: 'gemini-search-result:%E4%B9%9D%E5%AE%AB%E6%A0%BC:0-1', role: 'user', content: '用户消息' },
                    { id: 'gemini-search-result:%E4%B9%9D%E5%AE%AB%E6%A0%BC:0-2', role: 'assistant', content: '助手消息' }
                ]
            }
        });
    });

    it('emits detail request diagnostics for direct Gemini detail extraction', async () => {
        const locationSpy = mockGeminiLocation('/app/remote-1');
        const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        document.title = 'Gemini';
        document.body.innerHTML = `
            <main>
                <div class="chat-app-shell">loading</div>
            </main>
        `;

        setTimeout(() => {
            document.body.innerHTML = `
                <main>
                    <user-query>用户消息</user-query>
                    <model-response>助手消息</model-response>
                </main>
            `;
        }, 100);

        const response = await handleGeminiHistoryRequestForTest({
            action: 'GET_HISTORY_DETAIL',
            config: CONFIG,
            externalId: 'remote-1'
        });

        expect(response).toMatchObject({
            ok: true,
            data: {
                id: 'remote-1'
            }
        });
        expect(consoleSpy.mock.calls.some((call) => String(call[0]).includes('"stage":"detail-request"'))).toBe(true);
        expect(consoleSpy.mock.calls.some((call) => String(call[0]).includes('"stage":"detail-extract-start"'))).toBe(true);
        expect(consoleSpy.mock.calls.some((call) => String(call[0]).includes('"stage":"detail-ready-settled"'))).toBe(true);

        consoleSpy.mockRestore();
        locationSpy.mockRestore();
    });
});
