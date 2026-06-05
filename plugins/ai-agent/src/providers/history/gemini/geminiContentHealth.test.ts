import { describe, expect, it } from 'vitest';
import type { GeminiHistoryRemoteConfig } from '@plugins/ai-agent/src/internal';
import { countMissingSelectors, getRequiredSelectorKeys, isSelectorGroupHealthy } from './geminiContentHealth';

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
        maxMissingCount: 0
    }
};

describe('geminiContentHealth', () => {
    it('scopes list health checks to history selectors only', () => {
        const selectorKeys = getRequiredSelectorKeys('GET_HISTORY_LIST', CONFIG);
        const availableSelectors = new Set([
            CONFIG.selectors.historyListContainer,
            CONFIG.selectors.historyListItem
        ]);

        expect(selectorKeys).toEqual(['historyListContainer', 'historyListItem']);
        expect(countMissingSelectors(CONFIG, selectorKeys, (selector) => (
            availableSelectors.has(selector) ? ({} as Element) : null
        ))).toBe(0);
    });

    it('does not treat missing detail selectors as list mismatch', () => {
        const selectorKeys = getRequiredSelectorKeys('GET_HISTORY_LIST', CONFIG);
        const availableSelectors = new Set([
            CONFIG.selectors.historyListContainer,
            CONFIG.selectors.historyListItem
        ]);

        expect(isSelectorGroupHealthy(CONFIG, selectorKeys, (selector) => (
            availableSelectors.has(selector) ? ({} as Element) : null
        ))).toBe(true);
    });

    it('marks the list unhealthy when both list selectors are missing under the builtin tolerance', () => {
        const selectorKeys = getRequiredSelectorKeys('GET_HISTORY_LIST', {
            ...CONFIG,
            healthCheck: {
                ...CONFIG.healthCheck,
                maxMissingCount: 1
            }
        });

        expect(isSelectorGroupHealthy({
            ...CONFIG,
            healthCheck: {
                ...CONFIG.healthCheck,
                maxMissingCount: 1
            }
        }, selectorKeys, () => null)).toBe(false);
    });
});
