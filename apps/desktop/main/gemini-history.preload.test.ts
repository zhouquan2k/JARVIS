import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
    contextBridge: {
        exposeInMainWorld: vi.fn()
    }
}));

import {
    hasGeminiHistoryScaffold,
    isAuthRequired,
    shouldTreatMissingHistoryScaffoldAsAuthRequired
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

describe('gemini-history.preload auth detection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
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
});
