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
import type { GeminiHistoryRemoteConfig } from '@plugins/ai-agent/api';

const CONFIG: GeminiHistoryRemoteConfig = {
    providerId: 'gemini-web',
    version: 'test-1',
    matchOrigins: ['https://gemini.google.com'],
    selectors: {
        historyListContainer: 'conversations-list[data-test-id="all-conversations"]',
        historyListItem: 'a[data-test-id="conversation"]',
        historyTitle: '.conversation-title',
        historyLink: 'a[data-test-id="conversation"]',
        historySearchResultCount: '[data-test-id="result-count"]',
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

    it('does not treat Gemini detail pages as auth required only because the body mentions sign in', () => {
        expect(isAuthRequired(CONFIG, {
            querySelector: () => null,
            location: {
                pathname: '/app/remote-1',
                hostname: 'gemini.google.com'
            },
            bodyText: 'Sign in to Gemini settings to manage your account'
        })).toBe(false);
    });

    it('still treats Gemini detail pages with an explicit login gate as auth required', () => {
        const querySelector = vi.fn((selector: string) => {
            if (selector === CONFIG.selectors.loginGate) {
                return {} as Element;
            }

            return null;
        });

        expect(isAuthRequired(CONFIG, {
            querySelector,
            location: {
                pathname: '/app/remote-1',
                hostname: 'gemini.google.com'
            },
            bodyText: 'Sign in to continue'
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
            <conversations-list data-test-id="all-conversations" hidden></conversations-list>
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

    it('waits until the rendered search result count matches the Gemini count badge', async () => {
        const locationSpy = mockGeminiLocation('/search');
        document.body.innerHTML = `
            <input type="text" aria-label="搜索对话" value="" />
            <main>
                <conversations-list data-test-id="all-conversations" hidden></conversations-list>
                <search-window>
                    <div data-test-id="result-count">共 6 条结果</div>
                    <div class="search-window-container">
                        <article ng-reflect-router-link="/app/search-6">
                            <span class="conversation-title">最后 1 条</span>
                        </article>
                    </div>
                    <button data-test-id="history-load-more" type="button">加载更多</button>
                </search-window>
            </main>
        `;

        const loadMore = document.querySelector('[data-test-id="history-load-more"]') as HTMLButtonElement;
        let loadMoreClicks = 0;
        loadMore.addEventListener('click', () => {
            loadMoreClicks += 1;
            const container = document.querySelector('search-window .search-window-container');
            if (container && loadMoreClicks === 1) {
                setTimeout(() => {
                    container.innerHTML = `
                        <article ng-reflect-router-link="/app/search-1"><span class="conversation-title">结果 1</span></article>
                        <article ng-reflect-router-link="/app/search-2"><span class="conversation-title">结果 2</span></article>
                        <article ng-reflect-router-link="/app/search-3"><span class="conversation-title">结果 3</span></article>
                        <article ng-reflect-router-link="/app/search-4"><span class="conversation-title">结果 4</span></article>
                        <article ng-reflect-router-link="/app/search-5"><span class="conversation-title">结果 5</span></article>
                        <article ng-reflect-router-link="/app/search-6"><span class="conversation-title">结果 6</span></article>
                    `;
                }, 60);
            }
        });

        const searchConfig: GeminiHistoryRemoteConfig = {
            ...CONFIG,
            selectors: {
                ...CONFIG.selectors,
                historySearchInput: 'input[aria-label="搜索对话"]',
                historySearchResultContainer: 'search-window',
                historySearchResultItem: '[ng-reflect-router-link*="/app/"]',
                historySearchResultCount: '[data-test-id="result-count"]',
                lazyLoadSentinel: '[data-test-id="history-load-more"]'
            }
        };

        const response = await handleGeminiHistoryRequestForTest({
            action: 'GET_HISTORY_LIST',
            config: searchConfig,
            query: '计数'
        });

        expect(response).toEqual({
            ok: true,
            data: [
            { id: 'search-1', title: '结果 1', updatedAt: expect.any(Number) },
            { id: 'search-2', title: '结果 2', updatedAt: expect.any(Number) },
            { id: 'search-3', title: '结果 3', updatedAt: expect.any(Number) },
            { id: 'search-4', title: '结果 4', updatedAt: expect.any(Number) },
            { id: 'search-5', title: '结果 5', updatedAt: expect.any(Number) },
            { id: 'search-6', title: '结果 6', updatedAt: expect.any(Number) }
            ]
        });
        locationSpy.mockRestore();
    });

    it('extracts Gemini search-snippet button rows instead of treating the outer li as one result', () => {
        const locationSpy = mockGeminiLocation('/search');
        document.body.innerHTML = `
            <input type="text" aria-label="搜索对话" value="简历" />
            <main>
                <search-window>
                    <div class="search-window-container">
                        <h3 class="search-results-message">6 条与“简历”相符的搜索结果</h3>
                        <div class="results-scroll-container">
                            <infinite-scroller class="results-list">
                                <ul role="list" class="search-results-list">
                                    <li class="ng-star-inserted">
                                        <search-snippet tabindex="0">
                                            <div role="button" tabindex="0" class="snippet-container ng-star-inserted">
                                                <div class="snippet-content">
                                                    <div class="result">
                                                        <div class="title gds-title-m">简历重构：AI 集成专家定位</div>
                                                        <div class="text gds-body-m">你好！这份新的职业形象策略制定得非常精准。</div>
                                                    </div>
                                                    <div class="date gds-body-m">3月26日</div>
                                                </div>
                                            </div>
                                        </search-snippet>
                                    </li>
                                    <li class="ng-star-inserted">
                                        <search-snippet tabindex="0">
                                            <div role="button" tabindex="0" class="snippet-container ng-star-inserted">
                                                <div class="snippet-content">
                                                    <div class="result">
                                                        <div class="title gds-title-m">AI 时代下的职业发展策略</div>
                                                        <div class="text gds-body-m">你的思路非常清晰，目标明确。</div>
                                                    </div>
                                                    <div class="date gds-body-m">3月17日</div>
                                                </div>
                                            </div>
                                        </search-snippet>
                                    </li>
                                    <li class="ng-star-inserted">
                                        <search-snippet tabindex="0">
                                            <div role="button" tabindex="0" class="snippet-container ng-star-inserted">
                                                <div class="snippet-content">
                                                    <div class="result">
                                                        <div class="title gds-title-m">PDF 转 Markdown 简历</div>
                                                        <div class="text gds-body-m">这份是根据您提供的 PDF 内容整理而成的 Markdown 格式简历。</div>
                                                    </div>
                                                    <div class="date gds-body-m">3月19日</div>
                                                </div>
                                            </div>
                                        </search-snippet>
                                    </li>
                                    <li class="ng-star-inserted">
                                        <search-snippet tabindex="0">
                                            <div role="button" tabindex="0" class="snippet-container ng-star-inserted">
                                                <div class="snippet-content">
                                                    <div class="result">
                                                        <div class="title gds-title-m">AI 时代职业发展与品牌建设</div>
                                                        <div class="text gds-body-m">我现在在蒙特利尔市从事 developer 的工作。</div>
                                                    </div>
                                                    <div class="date gds-body-m">3月16日</div>
                                                </div>
                                            </div>
                                        </search-snippet>
                                    </li>
                                    <li class="ng-star-inserted">
                                        <search-snippet tabindex="0">
                                            <div role="button" tabindex="0" class="snippet-container ng-star-inserted">
                                                <div class="snippet-content">
                                                    <div class="result">
                                                        <div class="title gds-title-m">ChatPrizm 功能增强策略</div>
                                                        <div class="text gds-body-m">这是我传递给 gemini 的请求。</div>
                                                    </div>
                                                    <div class="date gds-body-m">3月28日</div>
                                                </div>
                                            </div>
                                        </search-snippet>
                                    </li>
                                    <li class="ng-star-inserted">
                                        <search-snippet tabindex="0">
                                            <div role="button" tabindex="0" class="snippet-container ng-star-inserted">
                                                <div class="snippet-content">
                                                    <div class="result">
                                                        <div class="title gds-title-m">蒙特利尔卖房流程与注意事项</div>
                                                        <div class="text gds-body-m">这个经纪人相关图片里面包含了哪些有用的信息。</div>
                                                    </div>
                                                    <div class="date gds-body-m">2月22日</div>
                                                </div>
                                            </div>
                                        </search-snippet>
                                    </li>
                                </ul>
                            </infinite-scroller>
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
                historySearchResultItem: 'search-snippet [role="button"], .snippet-container[role="button"], article, [ng-reflect-router-link*="/app/"], [role="option"], li'
            }
        };

        expect(extractHistoryList(searchConfig, '简历')).toEqual([
            { id: 'gemini-search-result:%E7%AE%80%E5%8E%86:0', title: '简历重构：AI 集成专家定位', updatedAt: expect.any(Number) },
            { id: 'gemini-search-result:%E7%AE%80%E5%8E%86:1', title: 'AI 时代下的职业发展策略', updatedAt: expect.any(Number) },
            { id: 'gemini-search-result:%E7%AE%80%E5%8E%86:2', title: 'PDF 转 Markdown 简历', updatedAt: expect.any(Number) },
            { id: 'gemini-search-result:%E7%AE%80%E5%8E%86:3', title: 'AI 时代职业发展与品牌建设', updatedAt: expect.any(Number) },
            { id: 'gemini-search-result:%E7%AE%80%E5%8E%86:4', title: 'ChatPrizm 功能增强策略', updatedAt: expect.any(Number) },
            { id: 'gemini-search-result:%E7%AE%80%E5%8E%86:5', title: '蒙特利尔卖房流程与注意事项', updatedAt: expect.any(Number) }
        ]);

        locationSpy.mockRestore();
    });

    it('reads the Gemini result count from class-based count nodes', async () => {
        const locationSpy = mockGeminiLocation('/search');
        document.body.innerHTML = `
            <input type="text" aria-label="搜索对话" value="" />
            <button type="button" aria-label="搜索">搜索</button>
            <main>
                <conversations-list data-test-id="all-conversations" hidden></conversations-list>
                <search-window>
                    <div class="search-results-count">共 3 条结果</div>
                    <div class="search-window-container"></div>
                </search-window>
            </main>
        `;

        const submit = document.querySelector('button[aria-label="搜索"]') as HTMLButtonElement;
        submit.addEventListener('click', () => {
            const container = document.querySelector('search-window .search-window-container');
            if (!container) {
                return;
            }

            setTimeout(() => {
                container.innerHTML = `
                    <article ng-reflect-router-link="/app/search-1">
                        <span class="conversation-title">简历优化建议</span>
                    </article>
                    <article ng-reflect-router-link="/app/search-2">
                        <span class="conversation-title">简历项目经历改写</span>
                    </article>
                    <article ng-reflect-router-link="/app/search-3">
                        <span class="conversation-title">英文简历润色</span>
                    </article>
                `;
            }, 60);
        });

        const searchConfig: GeminiHistoryRemoteConfig = {
            ...CONFIG,
            selectors: {
                ...CONFIG.selectors,
                historySearchInput: 'input[aria-label="搜索对话"]',
                historySearchSubmit: 'button[aria-label="搜索"]',
                historySearchResultContainer: 'search-window',
                historySearchResultItem: 'article, [ng-reflect-router-link*="/app/"], [role="option"]',
                historySearchResultCount: '[class*="result-count" i], [class*="results-count" i]'
            }
        };

        const response = await handleGeminiHistoryRequestForTest({
            action: 'GET_HISTORY_LIST',
            config: searchConfig,
            query: '简历'
        });

        expect(response).toEqual({
            ok: true,
            data: [
                { id: 'search-1', title: '简历优化建议', updatedAt: expect.any(Number) },
                { id: 'search-2', title: '简历项目经历改写', updatedAt: expect.any(Number) },
                { id: 'search-3', title: '英文简历润色', updatedAt: expect.any(Number) }
            ]
        });
        locationSpy.mockRestore();
    });

    it('excludes clear-search controls and keeps only visible result rows', () => {
        const locationSpy = mockGeminiLocation('/search');
        document.body.innerHTML = `
            <input type="text" aria-label="搜索对话" value="简历" />
            <main>
                <search-window>
                    <search-bar>
                        <button data-test-id="clear-button" aria-label="清除搜索内容"></button>
                    </search-bar>
                    <div class="search-results-count">6 条与“简历”相符的搜索结果</div>
                    <div class="results-body">
                        <div class="result-row">
                            <div class="title">简历重构：AI 集成专家定位</div>
                            <div class="summary">你好！这份新的职业形象策略制定得非常精准。</div>
                            <div class="date">3月26日</div>
                        </div>
                        <div class="result-row">
                            <div class="title">PDF 转 Markdown 简历</div>
                            <div class="summary">这份是根据您提供的 PDF 内容整理而成的 Markdown 格式简历。</div>
                            <div class="date">3月19日</div>
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
                historySearchResultItem: 'article, [role="option"], .result-row'
            }
        };

        expect(extractHistoryList(searchConfig, '简历')).toEqual([
            { id: 'gemini-search-result:%E7%AE%80%E5%8E%86:0', title: '简历重构：AI 集成专家定位', updatedAt: expect.any(Number) },
            { id: 'gemini-search-result:%E7%AE%80%E5%8E%86:1', title: 'PDF 转 Markdown 简历', updatedAt: expect.any(Number) }
        ]);

        locationSpy.mockRestore();
    });

    it('returns temporary ids for search-window rows without extractable history links', async () => {
        const locationSpy = mockGeminiLocation('/search');
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
