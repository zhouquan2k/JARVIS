export type ConversationRole = 'user' | 'assistant';

export interface ConversationMessage {
    id: string;
    role: ConversationRole;
    content: string;
}

export interface ConversationSyncState {
    deleted?: boolean;
}

export interface SyncConversation {
    id: string;
    backendId?: string;
    title: string;
    sourceType?: string;
    externalId?: string;
    messages: ConversationMessage[];
    updatedAt: number;
    sync?: ConversationSyncState;
}

export interface PushRequestBody {
    conversations: SyncConversation[];
}

export interface PullRequestBody {
    cursor: number | null;
}

export interface SyncPushResponse {
    processedIds: string[];
    nextCursor: number;
}

export interface SyncPullResponse {
    conversations: SyncConversation[];
    nextCursor: number;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRequiredString(record: JsonRecord, key: string, fieldName: string): string {
    const value = record[key];
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`${fieldName} 必须是非空字符串。`);
    }

    return value.trim();
}

function readOptionalString(record: JsonRecord, key: string): string | undefined {
    const value = record[key];
    if (value === undefined || value === null || value === '') {
        return undefined;
    }

    if (typeof value !== 'string') {
        throw new Error(`${key} 必须是字符串。`);
    }

    const normalized = value.trim();
    return normalized ? normalized : undefined;
}

function readRequiredTimestamp(record: JsonRecord, key: string, fieldName: string): number {
    const value = record[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${fieldName} 必须是有效时间戳。`);
    }

    return value;
}

function normalizeMessage(value: unknown, index: number): ConversationMessage {
    if (!isRecord(value)) {
        throw new Error(`messages[${index}] 必须是对象。`);
    }

    const role = readRequiredString(value, 'role', `messages[${index}].role`);
    if (role !== 'user' && role !== 'assistant') {
        throw new Error(`messages[${index}].role 必须是 user 或 assistant。`);
    }

    return {
        id: readRequiredString(value, 'id', `messages[${index}].id`),
        role,
        content: readRequiredString(value, 'content', `messages[${index}].content`)
    };
}

function normalizeSyncState(value: unknown): ConversationSyncState | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }

    if (!isRecord(value)) {
        throw new Error('sync 必须是对象。');
    }

    return value.deleted === true ? { deleted: true } : undefined;
}

export function normalizeConversation(value: unknown): SyncConversation {
    if (!isRecord(value)) {
        throw new Error('conversation 必须是对象。');
    }

    if (!Array.isArray(value.messages)) {
        throw new Error('messages 必须是数组。');
    }

    return {
        id: readRequiredString(value, 'id', 'conversation.id'),
        backendId: readOptionalString(value, 'backendId'),
        title: readRequiredString(value, 'title', 'conversation.title'),
        sourceType: readOptionalString(value, 'sourceType'),
        externalId: readOptionalString(value, 'externalId'),
        messages: value.messages.map((message, index) => normalizeMessage(message, index)),
        updatedAt: readRequiredTimestamp(value, 'updatedAt', 'conversation.updatedAt'),
        sync: normalizeSyncState(value.sync)
    };
}

export function normalizePushRequest(value: unknown): PushRequestBody {
    if (!isRecord(value) || !Array.isArray(value.conversations)) {
        throw new Error('push 请求必须包含 conversations 数组。');
    }

    return {
        conversations: value.conversations.map(normalizeConversation)
    };
}

export function normalizePullRequest(value: unknown): PullRequestBody {
    if (!isRecord(value)) {
        throw new Error('pull 请求体必须是对象。');
    }

    const { cursor } = value;
    if (cursor === null || cursor === undefined) {
        return { cursor: null };
    }

    if (typeof cursor !== 'number' || !Number.isFinite(cursor) || cursor < 0) {
        throw new Error('cursor 必须是非负数字或 null。');
    }

    return { cursor };
}
