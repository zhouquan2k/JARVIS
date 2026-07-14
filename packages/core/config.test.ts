import { describe, expect, it } from 'vitest';
import {
    APP_CONFIG,
    DEFAULT_SYNC_BASE_URL,
    DEFAULT_SYNC_KEY,
    findPreferredModel,
    firstPreferredModel,
    normalizePreferredDefaultModels,
    resolveSyncBaseUrl,
    resolveSyncKey,
    SYNC_KEY_STORAGE_KEY,
    validateSyncKey
} from './config';

describe('sync key config', () => {
    it('reads syncKey from storage before falling back to defaults', () => {
        const storage = {
            getItem(key: string) {
                return key === SYNC_KEY_STORAGE_KEY ? 'workspace-42' : null;
            }
        };

        expect(resolveSyncKey({ storage, isDevelopment: false })).toBe('workspace-42');
    });

    it('allows default syncKey in development only', () => {
        expect(resolveSyncKey({ isDevelopment: true })).toBe(DEFAULT_SYNC_KEY);
        expect(() => validateSyncKey(DEFAULT_SYNC_KEY, { isDevelopment: false })).toThrow(
            'syncKey=0 is only allowed in development; configure a real syncKey first.'
        );
    });

    it('reads syncBaseUrl from env before falling back to local server default', () => {
        expect(resolveSyncBaseUrl({
            env: {
                VITE_SYNC_BASE_URL: 'https://sync.example.com/api/sync/'
            }
        })).toBe('https://sync.example.com/api/sync');
        expect(resolveSyncBaseUrl()).toBe(DEFAULT_SYNC_BASE_URL);
    });
});

describe('preferred default model priority list', () => {
    const models = [
        { id: 'opus-4-8', name: 'Opus 4.8' },
        { id: 'sonnet-4-6', name: 'Sonnet 4.6' }
    ];

    it('normalizes a single string into a one-element list', () => {
        expect(normalizePreferredDefaultModels('Opus 4.8')).toEqual(['Opus 4.8']);
        expect(normalizePreferredDefaultModels(undefined)).toEqual([]);
        expect(normalizePreferredDefaultModels(['  ', 'Opus 4.8'])).toEqual(['Opus 4.8']);
    });

    it('skips unavailable earlier entries and matches the first available model in the list', () => {
        // 'Fable 5' 不在目录中，应跳过它并命中列表中下一个可用的 'Opus 4.8'。
        expect(findPreferredModel(models, ['Fable 5', 'Opus 4.8'])?.id).toBe('opus-4-8');
    });

    it('returns undefined when no entry in the list matches any model', () => {
        expect(findPreferredModel(models, ['Fable 5', 'Haiku 4.5'])).toBeUndefined();
    });

    it('returns the first entry of the list regardless of availability', () => {
        expect(firstPreferredModel(['Fable 5', 'Opus 4.8'])).toBe('Fable 5');
        expect(firstPreferredModel(undefined)).toBeUndefined();
    });
});

describe('group default model config', () => {
    it('uses GPT-5.6 Sol consistently for the ChatGPT group member', () => {
        const chatgptProvider = APP_CONFIG.providers.find((provider) => provider.id === 'chatgpt-dom');
        const defaultChatgptMember = APP_CONFIG.groupPresets.dom.find((member) => member.providerId === 'chatgpt-dom');
        const chatgptCandidate = APP_CONFIG.groupCandidates.find((member) => member.providerId === 'chatgpt-dom');

        expect(chatgptProvider?.preferredDefaultModel).toBe('GPT-5.6 Sol');
        expect(defaultChatgptMember?.modelId).toBe('GPT-5.6 Sol');
        expect(chatgptCandidate?.modelId).toBe('GPT-5.6 Sol');
    });
});
