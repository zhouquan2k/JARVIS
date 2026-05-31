export type ConversationRole = 'user' | 'assistant';

export interface MessageAttachment {
    id: string;
    type: 'image' | 'file';
    name: string;
    mimeType: string;
    size: number;
    base64Data?: string;
    previewBase64?: string;
}

export interface AnnotationRange {
    start: number;
    end: number;
}

export interface CiteAnnotation {
    kind: 'cite';
    range: AnnotationRange;
    payload: {
        refId: string;
        label: string;
        title?: string;
        url?: string;
        snippet?: string;
    };
}

export interface ImageGroupAnnotation {
    kind: 'image_group';
    range: AnnotationRange | null;
    payload: {
        groupId: string;
        images: Array<{
            id: string;
            mimeType: string;
            alt?: string;
            previewBase64?: string;
            remoteUrl?: string;
            width?: number;
            height?: number;
        }>;
    };
}

export type MessageAnnotation = CiteAnnotation | ImageGroupAnnotation;

export interface ConversationMessage {
    id: string;
    role: ConversationRole;
    content: string;
    createdAt?: number;
    questionId?: string;
    starred?: boolean;
    deleted?: boolean;
    attachments?: MessageAttachment[];
    annotations?: MessageAnnotation[];
}

export interface ConversationSyncState {
    deleted?: boolean;
}

export interface SyncDeletedConversation {
    id: string;
    updatedAt: number;
}

export interface SyncConversation {
    id: string;
    backendId?: string;
    title: string;
    agentKey?: string;
    boundNodeName?: string;
    starred?: boolean;
    origin?: string;
    externalId?: string;
    /** @deprecated Use documentIds instead */
    documentPaths?: string[];
    documentIds?: string[];
    messages: ConversationMessage[];
    updatedAt: number;
    sync?: ConversationSyncState;
}

export interface PushRequestBody {
    conversations: SyncConversation[];
    deletedConversations?: SyncDeletedConversation[];
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
    deletedConversations: SyncDeletedConversation[];
    nextCursor: number;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRequiredString(record: JsonRecord, key: string, fieldName: string): string {
    const value = record[key];
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`${fieldName} must be a non-empty string.`);
    }

    return value.trim();
}

function readRequiredText(record: JsonRecord, key: string, fieldName: string): string {
    const value = record[key];
    if (typeof value !== 'string') {
        throw new Error(`${fieldName} must be a string.`);
    }

    return value;
}

function readOptionalString(record: JsonRecord, key: string): string | undefined {
    const value = record[key];
    if (value === undefined || value === null || value === '') {
        return undefined;
    }

    if (typeof value !== 'string') {
        throw new Error(`${key} must be a string.`);
    }

    const normalized = value.trim();
    return normalized ? normalized : undefined;
}

function readRequiredTimestamp(record: JsonRecord, key: string, fieldName: string): number {
    const value = record[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${fieldName} must be a valid timestamp.`);
    }

    return value;
}

function readRequiredNumber(record: JsonRecord, key: string, fieldName: string): number {
    const value = record[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${fieldName} must be a valid number.`);
    }

    return value;
}

function readOptionalNumber(record: JsonRecord, key: string): number | undefined {
    const value = record[key];
    if (value === undefined || value === null) {
        return undefined;
    }

    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${key} must be a number.`);
    }

    return value;
}

function readOptionalBoolean(record: JsonRecord, key: string): boolean | undefined {
    const value = record[key];
    if (value === undefined || value === null) {
        return undefined;
    }

    if (typeof value !== 'boolean') {
        throw new Error(`${key} must be a boolean.`);
    }

    return value;
}

function normalizeAttachment(value: unknown, index: number, messageIndex: number): MessageAttachment {
    if (!isRecord(value)) {
        throw new Error(`messages[${messageIndex}].attachments[${index}] must be an object.`);
    }

    const type = readRequiredString(value, 'type', `messages[${messageIndex}].attachments[${index}].type`);
    if (type !== 'image' && type !== 'file') {
        throw new Error(`messages[${messageIndex}].attachments[${index}].type must be image or file.`);
    }

    return {
        id: readRequiredString(value, 'id', `messages[${messageIndex}].attachments[${index}].id`),
        type,
        name: readRequiredString(value, 'name', `messages[${messageIndex}].attachments[${index}].name`),
        mimeType: readRequiredString(value, 'mimeType', `messages[${messageIndex}].attachments[${index}].mimeType`),
        size: readRequiredNumber(value, 'size', `messages[${messageIndex}].attachments[${index}].size`),
        base64Data: readOptionalString(value, 'base64Data'),
        previewBase64: readOptionalString(value, 'previewBase64')
    };
}

function normalizeRange(value: unknown, fieldName: string): AnnotationRange {
    if (!isRecord(value)) {
        throw new Error(`${fieldName} must be an object.`);
    }

    return {
        start: readRequiredNumber(value, 'start', `${fieldName}.start`),
        end: readRequiredNumber(value, 'end', `${fieldName}.end`)
    };
}

function normalizeAnnotation(value: unknown, index: number, messageIndex: number): MessageAnnotation {
    if (!isRecord(value)) {
        throw new Error(`messages[${messageIndex}].annotations[${index}] must be an object.`);
    }

    const kind = readRequiredString(value, 'kind', `messages[${messageIndex}].annotations[${index}].kind`);
    const payload = value.payload;
    if (!isRecord(payload)) {
        throw new Error(`messages[${messageIndex}].annotations[${index}].payload must be an object.`);
    }

    if (kind === 'cite') {
        return {
            kind: 'cite',
            range: normalizeRange(value.range, `messages[${messageIndex}].annotations[${index}].range`),
            payload: {
                refId: readRequiredString(payload, 'refId', `messages[${messageIndex}].annotations[${index}].payload.refId`),
                label: readRequiredString(payload, 'label', `messages[${messageIndex}].annotations[${index}].payload.label`),
                title: readOptionalString(payload, 'title'),
                url: readOptionalString(payload, 'url'),
                snippet: readOptionalString(payload, 'snippet')
            }
        };
    }

    if (kind === 'image_group') {
        const images = payload.images;
        if (!Array.isArray(images) || images.length === 0) {
            throw new Error(`messages[${messageIndex}].annotations[${index}].payload.images must be a non-empty array.`);
        }

        return {
            kind: 'image_group',
            range: value.range === null || value.range === undefined
                ? null
                : normalizeRange(value.range, `messages[${messageIndex}].annotations[${index}].range`),
            payload: {
                groupId: readRequiredString(payload, 'groupId', `messages[${messageIndex}].annotations[${index}].payload.groupId`),
                images: images.map((image, imageIndex) => {
                    if (!isRecord(image)) {
                        throw new Error(`messages[${messageIndex}].annotations[${index}].payload.images[${imageIndex}] must be an object.`);
                    }

                    return {
                        id: readRequiredString(image, 'id', `messages[${messageIndex}].annotations[${index}].payload.images[${imageIndex}].id`),
                        mimeType: readRequiredString(image, 'mimeType', `messages[${messageIndex}].annotations[${index}].payload.images[${imageIndex}].mimeType`),
                        alt: readOptionalString(image, 'alt'),
                        previewBase64: readOptionalString(image, 'previewBase64'),
                        remoteUrl: readOptionalString(image, 'remoteUrl'),
                        width: readOptionalNumber(image, 'width'),
                        height: readOptionalNumber(image, 'height')
                    };
                })
            }
        };
    }

    throw new Error(`messages[${messageIndex}].annotations[${index}].kind is not supported.`);
}

function normalizeMessage(value: unknown, index: number): ConversationMessage {
    if (!isRecord(value)) {
        throw new Error(`messages[${index}] must be an object.`);
    }

    const role = readRequiredString(value, 'role', `messages[${index}].role`);
    if (role !== 'user' && role !== 'assistant') {
        throw new Error(`messages[${index}].role must be user or assistant.`);
    }

    return {
        id: readRequiredString(value, 'id', `messages[${index}].id`),
        role,
        content: readRequiredText(value, 'content', `messages[${index}].content`),
        createdAt: readOptionalNumber(value, 'createdAt'),
        questionId: readOptionalString(value, 'questionId'),
        starred: readOptionalBoolean(value, 'starred'),
        deleted: readOptionalBoolean(value, 'deleted'),
        attachments: Array.isArray(value.attachments)
            ? value.attachments.map((attachment, attachmentIndex) => normalizeAttachment(attachment, attachmentIndex, index))
            : undefined,
        annotations: Array.isArray(value.annotations)
            ? value.annotations.map((annotation, annotationIndex) => normalizeAnnotation(annotation, annotationIndex, index))
            : undefined
    };
}

function normalizeSyncState(value: unknown): ConversationSyncState | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }

    if (!isRecord(value)) {
        throw new Error('sync must be an object.');
    }

    return value.deleted === true ? { deleted: true } : undefined;
}

function normalizeDeletedConversation(value: unknown, index: number): SyncDeletedConversation {
    if (!isRecord(value)) {
        throw new Error(`deletedConversations[${index}] must be an object.`);
    }

    return {
        id: readRequiredString(value, 'id', `deletedConversations[${index}].id`),
        updatedAt: readRequiredTimestamp(value, 'updatedAt', `deletedConversations[${index}].updatedAt`)
    };
}

export function normalizeConversation(value: unknown): SyncConversation {
    if (!isRecord(value)) {
        throw new Error('conversation must be an object.');
    }

    if (!Array.isArray(value.messages)) {
        throw new Error('messages must be an array.');
    }

    return {
        id: readRequiredString(value, 'id', 'conversation.id'),
        backendId: readOptionalString(value, 'backendId'),
        title: readRequiredString(value, 'title', 'conversation.title'),
        agentKey: readOptionalString(value, 'agentKey'),
        boundNodeName: readOptionalString(value, 'boundNodeName'),
        starred: value.starred === true ? true : undefined,
        origin: readOptionalString(value, 'origin'),
        externalId: readOptionalString(value, 'externalId'),
        documentPaths: Array.isArray(value.documentPaths)
            ? Array.from(new Set(
                value.documentPaths.filter((path): path is string => {
                    return typeof path === 'string' && path.trim().length > 0;
                }).map((path) => path.trim())
            ))
            : undefined,
        documentIds: Array.isArray(value.documentIds)
            ? Array.from(new Set(
                value.documentIds.filter((id): id is string => {
                    return typeof id === 'string' && id.trim().length > 0;
                })
            ))
            : undefined,
        messages: value.messages.map((message, index) => normalizeMessage(message, index)),
        updatedAt: readRequiredTimestamp(value, 'updatedAt', 'conversation.updatedAt'),
        sync: normalizeSyncState(value.sync)
    };
}

export function normalizePushRequest(value: unknown): PushRequestBody {
    if (!isRecord(value) || !Array.isArray(value.conversations)) {
        throw new Error('Push request must include a conversations array.');
    }

    return {
        conversations: value.conversations.map(normalizeConversation),
        deletedConversations: Array.isArray(value.deletedConversations)
            ? value.deletedConversations.map((conversation, index) => normalizeDeletedConversation(conversation, index))
            : []
    };
}

export function normalizePullRequest(value: unknown): PullRequestBody {
    if (!isRecord(value)) {
        throw new Error('Pull request body must be an object.');
    }

    const { cursor } = value;
    if (cursor === null || cursor === undefined) {
        return { cursor: null };
    }

    if (typeof cursor !== 'number' || !Number.isFinite(cursor) || cursor < 0) {
        throw new Error('cursor must be a non-negative number or null.');
    }

    return { cursor };
}
