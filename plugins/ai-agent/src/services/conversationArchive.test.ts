import { describe, expect, it } from 'vitest';
import type { ConversationMessage, IModelProvider } from '@plugins/ai-agent/src/internal';
import { executeConversationArchive, splitQaDocument } from './conversationArchive';

class ArchiveMockProvider implements IModelProvider {
    id = 'archive-provider';
    prompt = '';

    constructor(private readonly responseText: string) {}

    async getAvailableModels() {
        return {
            models: [{ id: 'archive-model', name: 'Archive Model' }],
            defaultModel: 'archive-model'
        };
    }

    async checkAuth() {
        return true;
    }

    async sendMessage(prompt: string) {
        this.prompt = prompt;
        return {
            text: this.responseText,
            conversationId: 'archive-conversation',
            messageId: 'archive-message'
        };
    }

    abort() {}
}

function buildMessages(): ConversationMessage[] {
    return [
        {
            id: 'user-1',
            role: 'user',
            content: 'Please add a failure-path note.',
            createdAt: 1
        },
        {
            id: 'assistant-1',
            role: 'assistant',
            content: 'Added the failure-path note under troubleshooting.',
            createdAt: 2
        }
    ];
}

describe('conversationArchive', () => {
    it('splits Q and A by the first standard divider only', () => {
        const result = splitQaDocument([
            '# Q',
            '',
            'Question block',
            '',
            '***',
            '',
            '# A',
            '',
            'Answer block',
            '',
            '***',
            '',
            'Nested divider stays in A'
        ].join('\n'));

        expect(result).toEqual({
            q: '# Q\n\nQuestion block',
            a: '# A\n\nAnswer block\n\n***\n\nNested divider stays in A',
            divider: '***',
            inserted: false
        });
    });

    it('recognizes *** as the archive divider', () => {
        const result = splitQaDocument([
            '# Q',
            '',
            'Question block',
            '',
            '***',
            '',
            '# A',
            '',
            'Answer block'
        ].join('\n'));

        expect(result).toEqual({
            q: '# Q\n\nQuestion block',
            a: '# A\n\nAnswer block',
            divider: '***',
            inserted: false
        });
    });

    it('ignores --- and inserts *** when the document has no archive divider', () => {
        const result = splitQaDocument([
            '# Q',
            '',
            'Question block',
            '',
            '---',
            '',
            'Still question content'
        ].join('\n'));

        expect(result).toEqual({
            q: '# Q\n\nQuestion block\n\n---\n\nStill question content',
            a: '',
            divider: '***',
            inserted: true
        });
    });

    it('merges the full visible conversation into q and a', async () => {
        const provider = new ArchiveMockProvider('{"q":"# Q\\n\\nUpdated question","a":"# A\\n\\nUpdated answer"}');

        const result = await executeConversationArchive({
            provider,
            modelId: 'archive-model',
            documentMarkdown: '# Q\n\nOld question\n\n***\n\n# A\n\nOld answer',
            messages: buildMessages()
        });

        expect(provider.prompt).toContain('[USER]\nPlease add a failure-path note.');
        expect(provider.prompt).toContain('[ASSISTANT]\nAdded the failure-path note under troubleshooting.');
        expect(result).toMatchObject({
            originalQ: '# Q\n\nOld question',
            originalA: '# A\n\nOld answer',
            nextQ: '# Q\n\nUpdated question',
            nextA: '# A\n\nUpdated answer',
            nextDocument: '# Q\n\nUpdated question\n\n***\n\n# A\n\nUpdated answer',
            changed: true,
            insertedDivider: false
        });
    });

    it('excludes deleted messages from the archive prompt', async () => {
        const provider = new ArchiveMockProvider('```json\n{"q":"# Q","a":"# A"}\n```');
        const messages: ConversationMessage[] = [
            ...buildMessages(),
            {
                id: 'user-deleted',
                role: 'user',
                content: 'outdated message',
                createdAt: 3,
                deleted: true
            }
        ];

        await executeConversationArchive({
            provider,
            modelId: 'archive-model',
            documentMarkdown: '# Q\n\nOld question',
            messages
        });

        expect(provider.prompt).not.toContain('outdated message');
    });

    it('detects no-change results without writing a new document', async () => {
        const provider = new ArchiveMockProvider('{"q":"# Q\\n\\nOld question","a":"# A\\n\\nOld answer"}');

        const result = await executeConversationArchive({
            provider,
            modelId: 'archive-model',
            documentMarkdown: '# Q\n\nOld question\n\n***\n\n# A\n\nOld answer',
            messages: buildMessages()
        });

        expect(result.changed).toBe(false);
        expect(result.insertedDivider).toBe(false);
    });
});
