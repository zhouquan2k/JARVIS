import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conversation } from '../../interfaces/Conversation';
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
                async clear() {
                    Object.keys(target).forEach((key) => {
                        delete target[key];
                    });
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
            origin: 'local',
            messages: [
                {
                    id: 'm1',
                    role: 'user',
                    content: 'hello',
                    createdAt: 111,
                    questionId: 'question-1',
                    starred: true,
                    deleted: false,
                    attachments: [
                        {
                            id: 'a1',
                            type: 'image',
                            name: 'hello.png',
                            mimeType: 'image/png',
                            size: 128,
                            base64Data: 'Zm9v',
                            previewBase64: 'YmFy'
                        }
                    ]
                },
                {
                    id: 'm2',
                    role: 'assistant',
                    content: '引用内容 [1]',
                    createdAt: 112,
                    questionId: 'question-1',
                    deleted: false,
                    annotations: [
                        {
                            kind: 'cite',
                            range: { start: 5, end: 8 },
                            payload: {
                                refId: 'ref-1',
                                label: '[1]',
                                title: 'Source title',
                                url: 'https://example.com',
                                snippet: 'quoted'
                            }
                        },
                        {
                            kind: 'image_group',
                            range: null,
                            payload: {
                                groupId: 'group-1',
                                images: [
                                    {
                                        id: 'img-1',
                                        mimeType: 'image/png',
                                        previewBase64: 'cHJldmlldw==',
                                        width: 512,
                                        height: 512
                                    }
                                ]
                            }
                        }
                    ]
                }
            ],
            updatedAt: 123,
            archive: {
                documentPath: '/docs/archive.md',
                documentId: 'doc-archive',
                archivedAt: 122,
                sourceMessageCount: 2
            },
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

    it('keeps question metadata optional for legacy stored messages', async () => {
        const provider = new IndexedDBStorageProvider();
        const legacyConversation: Conversation = {
            id: 'legacy-conversation',
            title: 'Legacy conversation',
            origin: 'local',
            messages: [
                {
                    id: 'legacy-m1',
                    role: 'user',
                    content: 'legacy question'
                },
                {
                    id: 'legacy-m2',
                    role: 'assistant',
                    content: 'legacy answer'
                }
            ],
            updatedAt: 456
        };

        await provider.saveConversation(legacyConversation);

        const storedConversation = await provider.getConversation('legacy-conversation');
        expect(storedConversation?.messages).toEqual([
            {
                id: 'legacy-m1',
                role: 'user',
                content: 'legacy question',
                createdAt: undefined,
                questionId: undefined,
                starred: undefined,
                deleted: undefined,
                attachments: undefined,
                annotations: undefined
            },
            {
                id: 'legacy-m2',
                role: 'assistant',
                content: 'legacy answer',
                createdAt: undefined,
                questionId: undefined,
                starred: undefined,
                deleted: undefined,
                attachments: undefined,
                annotations: undefined
            }
        ]);
    });

    it('persists conversation agent keys across save and read', async () => {
        const provider = new IndexedDBStorageProvider();
        const conversation: Conversation = {
            id: 'agent-key-conversation',
            title: 'Agent key',
            origin: 'local',
            agentKey: '/workspace/.agent.json',
            starred: true,
            messages: [],
            updatedAt: 789
        };

        await provider.saveConversation(conversation);

        await expect(provider.getConversation(conversation.id)).resolves.toMatchObject({
            id: 'agent-key-conversation',
            agentKey: '/workspace/.agent.json',
            starred: true
        });
    });

    it('can clear all stored conversations for a fresh bootstrap', async () => {
        const provider = new IndexedDBStorageProvider();
        await provider.saveConversation({
            id: 'conversation-to-clear',
            title: 'Conversation to clear',
            origin: 'local',
            messages: [],
            updatedAt: 1
        });

        await provider.clear();

        await expect(provider.getAllConversations()).resolves.toEqual([]);
    });
});
