import { normalizeConversationMessage, type Conversation } from '@packages/core/src';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeImportedConversation(value: unknown, index: number, fileName: string): Conversation | null {
    if (!isRecord(value)) {
        return null;
    }

    const messagesValue = Array.isArray(value.messages) ? value.messages : null;
    if (!messagesValue) {
        return null;
    }

    const now = Date.now() + index;
    const externalId = typeof value.externalId === 'string' && value.externalId
        ? value.externalId
        : `${fileName}:${index + 1}`;

    return {
        id: crypto.randomUUID(),
        title: typeof value.title === 'string' && value.title.trim() ? value.title.trim() : `导入会话 ${index + 1}`,
        origin: 'external-file',
        backendId: typeof value.backendId === 'string' && value.backendId ? value.backendId : externalId,
        externalId,
        updatedAt: typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) ? value.updatedAt : now,
        messages: messagesValue.map((message, messageIndex) => normalizeConversationMessage(message, messageIndex))
    };
}

export function parseConversationImportPayload(rawText: string, fileName = 'import.json'): Conversation[] {
    const parsed = JSON.parse(rawText) as unknown;
    const candidates = Array.isArray(parsed)
        ? parsed
        : isRecord(parsed) && Array.isArray(parsed.conversations)
            ? parsed.conversations
            : [parsed];

    return candidates
        .map((candidate, index) => normalizeImportedConversation(candidate, index, fileName))
        .filter((conversation): conversation is Conversation => !!conversation);
}

export async function openConversationImportDialog(): Promise<Conversation[] | null> {
    if (typeof document === 'undefined') {
        return null;
    }

    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.style.display = 'none';

        input.addEventListener('change', async () => {
            try {
                const file = input.files?.[0];
                input.remove();
                if (!file) {
                    resolve(null);
                    return;
                }

                const text = await file.text();
                const conversations = parseConversationImportPayload(text, file.name);
                if (conversations.length === 0) {
                    reject(new Error('未识别到可导入的会话 JSON。'));
                    return;
                }

                resolve(conversations);
            } catch (error) {
                reject(error);
            }
        }, { once: true });

        document.body.appendChild(input);
        input.click();
    });
}
