import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conversation } from '../interfaces/IStorageProvider';
import { IndexedDBStorageProvider } from './IndexedDBStorageProvider';

type StoredValue = Record<string, Conversation>;

const stores = new Map<string, StoredValue>();

vi.mock('localforage', () => ({
    default: {
        createInstance: ({ name, storeName }: { name: string; storeName: string }) => {
            const key = `${name}:${storeName}`;
            if (!stores.has(key)) {
                stores.set(key, {});
            }
            const target = stores.get(key)!;
            return {
                async setItem(itemKey: string, value: Conversation) {
                    target[itemKey] = structuredClone(value);
                    return value;
                },
                async getItem<T>(itemKey: string) {
                    return (target[itemKey] ? structuredClone(target[itemKey]) : null) as T | null;
                },
                async removeItem(itemKey: string) {
                    delete target[itemKey];
                },
                async iterate(iterator: (value: Conversation) => void) {
                    Object.values(target).forEach((value) => iterator(structuredClone(value)));
                }
            };
        }
    }
}));

describe('IndexedDBStorageProvider', () => {
    beforeEach(() => {
        stores.clear();
    });

    it('preserves sync metadata during save and read', async () => {
        const provider = new IndexedDBStorageProvider();
        const conversation: Conversation = {
            id: 'conversation-1',
            title: 'Synced conversation',
            sourceType: 'local',
            messages: [{ id: 'm1', role: 'user', content: 'hello' }],
            updatedAt: 123,
            sync: {
                dirty: true,
                deleted: false,
                syncedAt: 100
            }
        };

        await provider.saveConversation(conversation);

        const storedConversation = await provider.getConversation('conversation-1');
        expect(storedConversation).toEqual(conversation);

        const allConversations = await provider.getAllConversations();
        expect(allConversations).toEqual([conversation]);
    });
});
