import type { Task, TaskExecutionState, TaskPriority, TaskRecurrence } from '@plugins/task-mgr/api';

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

export type GroupMemberStatus = 'pending' | 'streaming' | 'done' | 'error';
export type GroupSummaryPhase = 'waiting' | 'streaming' | 'done' | 'error';

export interface GroupMemberPart {
    name: string;
    providerId: string;
    modelId: string;
    content: string;
    status: GroupMemberStatus;
    error?: string;
    conversationUrl?: string;
}

export interface GroupSummaryPart {
    phase: GroupSummaryPhase;
    content: string;
    error?: string;
    providerId?: string;
    conversationUrl?: string;
}

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
    groupMembers?: GroupMemberPart[];
    groupSummary?: GroupSummaryPart;
}

export interface ModelSelectionGroupMember {
    providerId: string;
    modelId: string;
    name: string;
}

export interface ConversationModelSelection {
    providerId: string;
    modelId: string;
    modelOptions: Record<string, boolean>;
    reasoningEffort?: 'low' | 'medium' | 'high';
    explicit?: boolean;
    groupMembers?: ModelSelectionGroupMember[];
}

export interface ConversationSyncState {
    deleted?: boolean;
}

export interface SyncDeletedConversation {
    id: string;
    updatedAt: number;
}

export type SyncTaskRecord = Task;

export interface SyncDeletedTask {
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
    modelSelection?: ConversationModelSelection;
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
    processedDeletedIds: string[];
    nextCursor: number;
}

export interface SyncPullResponse {
    conversations: SyncConversation[];
    deletedConversations: SyncDeletedConversation[];
    nextCursor: number;
}

export interface TaskPushRequestBody {
    tasks: SyncTaskRecord[];
    deletedTasks?: SyncDeletedTask[];
}

export interface TaskPullRequestBody {
    cursor: number | null;
}

export interface TaskSyncPullResponse {
    tasks: SyncTaskRecord[];
    deletedTasks: SyncDeletedTask[];
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

function normalizeGroupMembers(value: unknown[]): GroupMemberPart[] {
    const result: GroupMemberPart[] = [];
    for (const entry of value) {
        if (!isRecord(entry)) {
            continue;
        }
        if (typeof entry.name !== 'string'
            || typeof entry.providerId !== 'string'
            || typeof entry.modelId !== 'string') {
            continue;
        }
        const status = entry.status === 'pending'
            || entry.status === 'streaming'
            || entry.status === 'done'
            || entry.status === 'error'
            ? entry.status
            : 'done';
        result.push({
            name: entry.name,
            providerId: entry.providerId,
            modelId: entry.modelId,
            content: typeof entry.content === 'string' ? entry.content : '',
            status,
            error: typeof entry.error === 'string' ? entry.error : undefined,
            conversationUrl: typeof entry.conversationUrl === 'string' ? entry.conversationUrl : undefined
        });
    }
    return result;
}

function normalizeModelSelectionGroupMembers(value: unknown[]): ModelSelectionGroupMember[] {
    const result: ModelSelectionGroupMember[] = [];
    for (const entry of value) {
        if (!isRecord(entry)) {
            continue;
        }
        if (typeof entry.providerId !== 'string'
            || typeof entry.modelId !== 'string'
            || typeof entry.name !== 'string') {
            continue;
        }
        result.push({
            providerId: entry.providerId,
            modelId: entry.modelId,
            name: entry.name
        });
    }
    return result;
}

function normalizeModelSelection(value: unknown): ConversationModelSelection | undefined {
    if (!isRecord(value)) {
        return undefined;
    }
    if (typeof value.providerId !== 'string' || typeof value.modelId !== 'string') {
        return undefined;
    }

    const modelOptions: Record<string, boolean> = {};
    if (isRecord(value.modelOptions)) {
        for (const [key, optionValue] of Object.entries(value.modelOptions)) {
            if (typeof optionValue === 'boolean') {
                modelOptions[key] = optionValue;
            }
        }
    }

    const reasoningEffort = value.reasoningEffort === 'low'
        || value.reasoningEffort === 'medium'
        || value.reasoningEffort === 'high'
        ? value.reasoningEffort
        : undefined;

    return {
        providerId: value.providerId,
        modelId: value.modelId,
        modelOptions,
        ...(reasoningEffort ? { reasoningEffort } : {}),
        ...(value.explicit === true ? { explicit: true } : {}),
        ...(Array.isArray(value.groupMembers)
            ? { groupMembers: normalizeModelSelectionGroupMembers(value.groupMembers) }
            : {})
    };
}

function normalizeGroupSummary(value: unknown): GroupSummaryPart | undefined {
    if (!isRecord(value)) {
        return undefined;
    }
    const phase = value.phase === 'waiting'
        || value.phase === 'streaming'
        || value.phase === 'done'
        || value.phase === 'error'
        ? value.phase
        : 'done';
    return {
        phase,
        content: typeof value.content === 'string' ? value.content : '',
        error: typeof value.error === 'string' ? value.error : undefined,
        providerId: typeof value.providerId === 'string' ? value.providerId : undefined,
        conversationUrl: typeof value.conversationUrl === 'string' ? value.conversationUrl : undefined
    };
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
            : undefined,
        groupMembers: Array.isArray(value.groupMembers)
            ? normalizeGroupMembers(value.groupMembers)
            : undefined,
        groupSummary: value.groupSummary !== undefined
            ? normalizeGroupSummary(value.groupSummary)
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

function normalizeTaskPriority(value: unknown, fieldName: string): TaskPriority | null {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    if (value === 'low' || value === 'medium' || value === 'high') {
        return value;
    }

    throw new Error(`${fieldName} must be one of low, medium, high, or null.`);
}

function normalizeTaskExecutionState(value: unknown, fieldName: string): TaskExecutionState {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    if (value === 'doing' || value === 'morning' || value === 'afternoon' || value === 'evening') {
        return value;
    }

    throw new Error(`${fieldName} must be one of doing, morning, afternoon, evening, or null.`);
}

function normalizeTaskRecurrence(value: unknown): TaskRecurrence {
    if (value === 'daily' || value === 'weekly' || value === 'monthly') {
        return value;
    }

    return null;
}

function normalizeTaskPath(value: unknown, fieldName: string): string | null {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    if (typeof value !== 'string') {
        throw new Error(`${fieldName} must be a string or null.`);
    }

    const trimmed = value.trim();
    if (!trimmed || trimmed === '/') {
        return null;
    }

    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    const normalized = withLeadingSlash.replace(/\/+/g, '/');
    const segments = normalized.split('/');
    if (segments.some((segment) => segment === '..')) {
        throw new Error(`${fieldName} escapes the workspace root.`);
    }

    return normalized.endsWith('/') ? normalized : normalized;
}

function normalizeTaskAgentKey(value: unknown): string | null {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    if (typeof value !== 'string') {
        throw new Error('task.agentKey must be a string or null.');
    }

    const normalized = value.trim();
    return normalized ? normalized : null;
}

function normalizeTaskDocumentId(value: unknown): string | null {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    if (typeof value !== 'string') {
        throw new Error('task.documentId must be a string or null.');
    }

    const normalized = value.trim();
    return normalized ? normalized : null;
}

function normalizeOptionalTimestamp(value: unknown, fieldName: string): number | null {
    if (value === undefined || value === null) {
        return null;
    }

    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${fieldName} must be a valid timestamp or null.`);
    }

    return value;
}

function normalizeTaskCalendarSyncStatus(value: unknown): Task['calendarSyncStatus'] {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    if (value === 'synced' || value === 'failed') {
        return value;
    }

    throw new Error('task.calendarSyncStatus must be synced, failed, or null.');
}

export function normalizeTaskRecord(value: unknown, fallbackNow = Date.now()): SyncTaskRecord {
    if (!isRecord(value)) {
        throw new Error('task must be an object.');
    }

    const completed = readOptionalBoolean(value, 'completed') ?? false;
    const createdAt = readOptionalNumber(value, 'createdAt') ?? fallbackNow;
    const updatedAt = readOptionalNumber(value, 'updatedAt') ?? fallbackNow;

    return {
        id: readRequiredString(value, 'id', 'task.id'),
        title: readRequiredString(value, 'title', 'task.title'),
        notes: readRequiredText(value, 'notes', 'task.notes'),
        completed,
        dueAt: normalizeOptionalTimestamp(value.dueAt, 'task.dueAt'),
        priority: normalizeTaskPriority(value.priority, 'task.priority'),
        executionState: normalizeTaskExecutionState(value.executionState, 'task.executionState'),
        documentPath: normalizeTaskPath(value.documentPath, 'task.documentPath'),
        documentId: normalizeTaskDocumentId(value.documentId),
        agentKey: normalizeTaskAgentKey(value.agentKey),
        createdAt,
        updatedAt,
        completedAt: completed
            ? (normalizeOptionalTimestamp(value.completedAt, 'task.completedAt') ?? updatedAt)
            : null,
        calendarProviderId: readOptionalString(value, 'calendarProviderId') ?? null,
        calendarEventId: readOptionalString(value, 'calendarEventId') ?? null,
        calendarSyncStatus: normalizeTaskCalendarSyncStatus(value.calendarSyncStatus),
        calendarLastSyncedAt: normalizeOptionalTimestamp(value.calendarLastSyncedAt, 'task.calendarLastSyncedAt'),
        calendarLastSyncError: readOptionalString(value, 'calendarLastSyncError') ?? null,
        recurrence: normalizeTaskRecurrence(value.recurrence)
    };
}

function normalizeDeletedTask(value: unknown, index: number): SyncDeletedTask {
    if (!isRecord(value)) {
        throw new Error(`deletedTasks[${index}] must be an object.`);
    }

    return {
        id: readRequiredString(value, 'id', `deletedTasks[${index}].id`),
        updatedAt: readRequiredTimestamp(value, 'updatedAt', `deletedTasks[${index}].updatedAt`)
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
        sync: normalizeSyncState(value.sync),
        modelSelection: normalizeModelSelection(value.modelSelection)
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

export function normalizeTaskPushRequest(value: unknown): TaskPushRequestBody {
    if (!isRecord(value) || !Array.isArray(value.tasks)) {
        throw new Error('Task push request must include a tasks array.');
    }

    return {
        tasks: value.tasks.map((task) => normalizeTaskRecord(task)),
        deletedTasks: Array.isArray(value.deletedTasks)
            ? value.deletedTasks.map((task, index) => normalizeDeletedTask(task, index))
            : []
    };
}

export function normalizeTaskPullRequest(value: unknown): TaskPullRequestBody {
    return normalizePullRequest(value);
}
