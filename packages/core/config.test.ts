import { describe, expect, it } from 'vitest';
import {
    DEFAULT_SYNC_BASE_URL,
    DEFAULT_SYNC_KEY,
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
            'syncKey=0 仅允许在开发环境使用，请先配置真实的 syncKey。'
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
