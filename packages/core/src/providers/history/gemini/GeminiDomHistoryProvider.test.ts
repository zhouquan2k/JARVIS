import { describe, expect, it } from 'vitest';
import { ExternalHistoryError, type GeminiHistoryRemoteConfig } from '@packages/core/src';
import { GeminiDomHistoryProvider } from './GeminiDomHistoryProvider';

const CONFIG: GeminiHistoryRemoteConfig = {
    providerId: 'gemini-web',
    version: 'test-1',
    matchOrigins: ['https://gemini.google.com'],
    selectors: {
        historyListContainer: '.history-list',
        historyListItem: '.history-item',
        historyTitle: '.history-title',
        historyLink: 'a',
        conversationRoot: 'main',
        userBubble: '.user',
        assistantBubble: '.assistant'
    },
    healthCheck: {
        requiredSelectors: ['historyListContainer'],
        maxMissingCount: 1
    }
};

describe('GeminiDomHistoryProvider', () => {
    it('normalizes Gemini history summaries with shared origin ids', async () => {
        let validatedConfig: GeminiHistoryRemoteConfig | null = null;
        let receivedQuery: string | undefined;
        const provider = new GeminiDomHistoryProvider({
            configLoader: {
                async load() {
                    return {
                        config: CONFIG,
                        metadata: {
                            providerId: 'gemini-history',
                            version: 'test-1',
                            fetchedAt: 1,
                            source: 'remote'
                        }
                    };
                },
                async markValidated(config: GeminiHistoryRemoteConfig) {
                    validatedConfig = config;
                }
            } as any,
            tabBridge: {
                async getHistoryList(_config: GeminiHistoryRemoteConfig, options?: { query?: string }) {
                    receivedQuery = options?.query;
                    return [
                        { id: 'gemini-1', title: 'Gemini Summary', updatedAt: 10 }
                    ];
                }
            } as any
        });

        await expect(provider.getHistoryList()).resolves.toEqual([
            {
                id: 'gemini-1',
                title: 'Gemini Summary',
                updatedAt: 10,
                origin: 'gemini-web'
            }
        ]);
        expect(validatedConfig).toEqual(CONFIG);
        expect(receivedQuery).toBeUndefined();
    });

    it('forwards non-empty query to the Gemini bridge and supports empty results', async () => {
        let receivedQuery: string | undefined;
        const provider = new GeminiDomHistoryProvider({
            configLoader: {
                async load() {
                    return {
                        config: CONFIG,
                        metadata: {
                            providerId: 'gemini-history',
                            version: 'test-1',
                            fetchedAt: 1,
                            source: 'remote'
                        }
                    };
                },
                async markValidated() {
                    return undefined;
                }
            } as any,
            tabBridge: {
                async getHistoryList(_config: GeminiHistoryRemoteConfig, options?: { query?: string }) {
                    receivedQuery = options?.query;
                    return [];
                }
            } as any
        });

        await expect(provider.getHistoryList({ query: 'incident' })).resolves.toEqual([]);
        expect(receivedQuery).toBe('incident');
    });

    it('returns normalized recoverable errors for empty details', async () => {
        const provider = new GeminiDomHistoryProvider({
            configLoader: {
                async load() {
                    return {
                        config: CONFIG,
                        metadata: {
                            providerId: 'gemini-history',
                            version: 'test-1',
                            fetchedAt: 1,
                            source: 'remote'
                        }
                    };
                },
                async markValidated() {
                    return undefined;
                }
            } as any,
            tabBridge: {
                async getHistoryDetail() {
                    return {
                        id: 'gemini-1',
                        title: 'Empty Gemini Chat',
                        updatedAt: 10,
                        messages: []
                    };
                }
            } as any
        });

        await expect(provider.getHistoryDetail('gemini-1')).rejects.toMatchObject({
            name: 'ExternalHistoryError',
            code: 'DETAIL_NOT_FOUND'
        } satisfies Partial<ExternalHistoryError>);
    });

    it('falls back to summary title when detail title is a generic Gemini page title', async () => {
        let validatedConfig: GeminiHistoryRemoteConfig | null = null;
        const provider = new GeminiDomHistoryProvider({
            configLoader: {
                async load() {
                    return {
                        config: CONFIG,
                        metadata: {
                            providerId: 'gemini-history',
                            version: 'test-1',
                            fetchedAt: 1,
                            source: 'remote'
                        }
                    };
                },
                async markValidated(config: GeminiHistoryRemoteConfig) {
                    validatedConfig = config;
                }
            } as any,
            tabBridge: {
                async getHistoryList() {
                    return [
                        { id: 'gemini-1', title: '真正的会话标题', updatedAt: 10 }
                    ];
                },
                async getHistoryDetail() {
                    return {
                        id: 'gemini-1',
                        title: 'Google Gemini',
                        updatedAt: 10,
                        messages: [
                            { id: 'm1', role: 'assistant', content: '内容' }
                        ]
                    };
                }
            } as any
        });

        await provider.getHistoryList();
        await expect(provider.getHistoryDetail('gemini-1')).resolves.toMatchObject({
            title: '真正的会话标题'
        });
        expect(validatedConfig).toEqual(CONFIG);
    });
});
