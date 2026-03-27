import { describe, expect, it } from 'vitest';
import type { Conversation, IConversationStorageProvider } from '../index';
import { StorageBackedContextProvider } from './StorageBackedContextProvider';

class MemoryConversationStorageProvider implements IConversationStorageProvider {
    id = 'memory-conversation-storage';
    private readonly conversations = new Map<string, Conversation>();

    async saveConversation(chat: Conversation): Promise<void> {
        this.conversations.set(chat.id, chat);
    }

    async getConversation(id: string): Promise<Conversation | null> {
        return this.conversations.get(id) ?? null;
    }

    async getAllConversations(): Promise<Conversation[]> {
        return Array.from(this.conversations.values());
    }

    async deleteConversation(id: string): Promise<void> {
        this.conversations.delete(id);
    }
}

describe('StorageBackedContextProvider', () => {
    it('supports the canonical conversation storage interface name', async () => {
        const provider = new MemoryConversationStorageProvider();
        await provider.saveConversation({
            id: 'conversation-1',
            title: 'Conversation',
            origin: 'local',
            updatedAt: 1,
            messages: []
        });

        const conversations = await provider.getAllConversations();
        expect(conversations).toHaveLength(1);
    });

    it('reads writes and creates context nodes', async () => {
        let snapshot = {
            nodes: [
                { path: '/welcome.md', name: 'welcome.md', kind: 'file' as const }
            ],
            documents: {
                '/welcome.md': '# Welcome'
            }
        };

        const provider = new StorageBackedContextProvider({
            id: 'test-context',
            async readSnapshot() {
                return snapshot;
            },
            async writeSnapshot(nextSnapshot) {
                snapshot = nextSnapshot;
            },
            initialSnapshot: snapshot
        });

        await provider.initializeAccess();
        const nodes = await provider.listTree();
        expect(nodes).toHaveLength(1);

        await provider.writeDocument('/welcome.md', '# Updated');
        expect((await provider.readDocument('/welcome.md')).content).toBe('# Updated');

        await provider.createNode({
            name: 'notes',
            kind: 'directory'
        });
        await provider.createNode({
            parentPath: '/notes',
            name: 'today.md',
            kind: 'file'
        });

        const childNodes = await provider.listTree('/notes');
        expect(childNodes.map((node) => node.path)).toEqual(['/notes/today.md']);
    });
});
