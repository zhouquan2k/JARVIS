import { Hono, type Context } from 'hono';
import type { ConversationQuery } from '@plugins/ai-agent/api';
import type { Task, TaskPriority, TaskQueryTag } from '@plugins/task-mgr/api';
import type { ServerConfig } from '../config.js';
import { HttpContextService } from '../services/httpContextService.js';
import type { ContextSearchRequest, CreateContextNodeInput, MoveContextNodeInput, RenameContextNodeInput, WriteContextDocumentInput } from '../types/context.js';

const ALLOW_HEADERS = 'content-type';
const ALLOW_METHODS = 'GET, POST, OPTIONS';

function resolveCorsOrigin(origin: string | undefined, config: ServerConfig): string | null {
    if (!origin) {
        return null;
    }

    if (config.isDevelopment) {
        return '*';
    }

    return config.corsAllowlist.includes(origin) ? origin : null;
}

function applyCorsHeaders(c: Context, origin: string): void {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Headers', ALLOW_HEADERS);
    c.header('Access-Control-Allow-Methods', ALLOW_METHODS);
    c.header('Vary', 'Origin');
}

async function readJsonBody(c: Context): Promise<unknown> {
    try {
        return await c.req.json();
    } catch {
        throw new Error('Request body must be valid JSON.');
    }
}

function normalizeObjectBody(body: unknown): Record<string, unknown> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new Error('Request body must be an object.');
    }
    return body as Record<string, unknown>;
}

function normalizeOptionalPath(body: Record<string, unknown>): string | undefined {
    const value = body.parentPath;
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    if (typeof value !== 'string') {
        throw new Error('parentPath must be a string.');
    }
    return value;
}

function normalizeRequiredPath(body: Record<string, unknown>): string {
    const value = body.path;
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error('path must not be empty.');
    }
    return value;
}

function normalizeConversationQuery(body: Record<string, unknown>): ConversationQuery {
    if (body.documentPath !== undefined && body.documentPath !== null && typeof body.documentPath !== 'string') {
        throw new Error('documentPath must be a string.');
    }
    if (body.documentId !== undefined && body.documentId !== null && typeof body.documentId !== 'string') {
        throw new Error('documentId must be a string.');
    }

    return {
        documentPath: typeof body.documentPath === 'string' ? body.documentPath : undefined,
        documentId: typeof body.documentId === 'string' ? body.documentId : undefined
    };
}

function normalizeCurNode(body: Record<string, unknown>): string {
    const value = body.curNode;
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error('curNode must not be empty.');
    }
    return value;
}

function normalizeOptionalBoolean(value: unknown, fieldName: string): boolean | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value !== 'boolean') {
        throw new Error(`${fieldName} must be a boolean.`);
    }
    return value;
}

function normalizeOptionalTaskScopePath(value: unknown, fieldName: string): string | null | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (value === null || value === '') {
        return null;
    }
    if (typeof value !== 'string') {
        throw new Error(`${fieldName} must be a string.`);
    }
    return value;
}

function normalizeTaskQueryTag(value: unknown): TaskQueryTag | null | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (value === null || value === '') {
        return null;
    }
    if (value === 'all' || value === 'today' || value === 'planned') {
        return value;
    }
    throw new Error('tag must be one of all, today, planned, or null.');
}

function normalizeTaskPriority(value: unknown): TaskPriority | null {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    if (value === 'low' || value === 'medium' || value === 'high') {
        return value;
    }
    throw new Error('priority must be one of low, medium, or high.');
}

function normalizeTask(body: Record<string, unknown>): Task {
    if (typeof body.id !== 'string') {
        throw new Error('task.id must be a string.');
    }
    if (typeof body.title !== 'string' || !body.title.trim()) {
        throw new Error('task.title must not be empty.');
    }
    if (typeof body.notes !== 'string') {
        throw new Error('task.notes must be a string.');
    }
    if (typeof body.completed !== 'boolean') {
        throw new Error('task.completed must be a boolean.');
    }
    if (body.dueAt !== null && body.dueAt !== undefined && (typeof body.dueAt !== 'number' || !Number.isFinite(body.dueAt))) {
        throw new Error('task.dueAt must be a number or null.');
    }
    if (typeof body.createdAt !== 'number' || !Number.isFinite(body.createdAt)) {
        throw new Error('task.createdAt must be a number.');
    }
    if (typeof body.updatedAt !== 'number' || !Number.isFinite(body.updatedAt)) {
        throw new Error('task.updatedAt must be a number.');
    }
    if (body.completedAt !== null && body.completedAt !== undefined && (typeof body.completedAt !== 'number' || !Number.isFinite(body.completedAt))) {
        throw new Error('task.completedAt must be a number or null.');
    }
    if (body.calendarProviderId !== null && body.calendarProviderId !== undefined && typeof body.calendarProviderId !== 'string') {
        throw new Error('task.calendarProviderId must be a string or null.');
    }
    if (body.calendarEventId !== null && body.calendarEventId !== undefined && typeof body.calendarEventId !== 'string') {
        throw new Error('task.calendarEventId must be a string or null.');
    }
    if (body.calendarSyncStatus !== null && body.calendarSyncStatus !== undefined && body.calendarSyncStatus !== 'synced' && body.calendarSyncStatus !== 'failed') {
        throw new Error('task.calendarSyncStatus must be synced, failed, or null.');
    }
    if (body.calendarLastSyncedAt !== null && body.calendarLastSyncedAt !== undefined && (typeof body.calendarLastSyncedAt !== 'number' || !Number.isFinite(body.calendarLastSyncedAt))) {
        throw new Error('task.calendarLastSyncedAt must be a number or null.');
    }
    if (body.calendarLastSyncError !== null && body.calendarLastSyncError !== undefined && typeof body.calendarLastSyncError !== 'string') {
        throw new Error('task.calendarLastSyncError must be a string or null.');
    }

    return {
        id: body.id,
        title: body.title,
        notes: body.notes,
        completed: body.completed,
        dueAt: typeof body.dueAt === 'number' ? body.dueAt : null,
        priority: normalizeTaskPriority(body.priority),
        documentPath: normalizeOptionalTaskScopePath(body.documentPath, 'task.documentPath') ?? null,
        documentId: typeof body.documentId === 'string' && body.documentId.trim() ? body.documentId.trim() : null,
        agentKey: normalizeOptionalTaskScopePath(body.agentKey, 'task.agentKey') ?? null,
        createdAt: body.createdAt,
        updatedAt: body.updatedAt,
        completedAt: typeof body.completedAt === 'number' ? body.completedAt : null,
        calendarProviderId: typeof body.calendarProviderId === 'string' ? body.calendarProviderId : null,
        calendarEventId: typeof body.calendarEventId === 'string' ? body.calendarEventId : null,
        calendarSyncStatus: body.calendarSyncStatus === 'synced' || body.calendarSyncStatus === 'failed'
            ? body.calendarSyncStatus
            : null,
        calendarLastSyncedAt: typeof body.calendarLastSyncedAt === 'number' ? body.calendarLastSyncedAt : null,
        calendarLastSyncError: typeof body.calendarLastSyncError === 'string' ? body.calendarLastSyncError : null
    };
}

function normalizeTaskEnvelope(body: Record<string, unknown>): Task {
    if (!body.task || typeof body.task !== 'object' || Array.isArray(body.task)) {
        throw new Error('task must be an object.');
    }

    return normalizeTask(body.task as Record<string, unknown>);
}

function normalizeWriteDocumentInput(body: Record<string, unknown>): WriteContextDocumentInput {
    if (typeof body.mimeType !== 'string' || !body.mimeType.trim()) {
        throw new Error('mimeType must not be empty.');
    }

    if (typeof body.dataBase64 !== 'string') {
        throw new Error('dataBase64 must be a string.');
    }

    if (body.expectedVersion !== undefined && body.expectedVersion !== null && typeof body.expectedVersion !== 'string') {
        throw new Error('expectedVersion must be a string.');
    }

    return {
        path: normalizeRequiredPath(body),
        mimeType: body.mimeType,
        dataBase64: body.dataBase64,
        expectedVersion: typeof body.expectedVersion === 'string' ? body.expectedVersion : undefined
    };
}

function normalizeCreateNodeInput(body: Record<string, unknown>): CreateContextNodeInput {
    if (typeof body.name !== 'string' || !body.name.trim()) {
        throw new Error('name must not be empty.');
    }
    if (body.kind !== 'file' && body.kind !== 'directory') {
        throw new Error('kind must be file or directory.');
    }

    return {
        parentPath: normalizeOptionalPath(body),
        name: body.name,
        kind: body.kind
    };
}

function normalizeRenameNodeInput(body: Record<string, unknown>): RenameContextNodeInput {
    if (typeof body.name !== 'string' || !body.name.trim()) {
        throw new Error('name must not be empty.');
    }

    return {
        path: normalizeRequiredPath(body),
        name: body.name
    };
}

function normalizeMoveNodeInput(body: Record<string, unknown>): MoveContextNodeInput {
    const targetParentPath = body.targetParentPath;
    if (targetParentPath !== undefined && targetParentPath !== null && targetParentPath !== '' && typeof targetParentPath !== 'string') {
        throw new Error('targetParentPath must be a string.');
    }

    return {
        path: normalizeRequiredPath(body),
        targetParentPath: typeof targetParentPath === 'string' ? targetParentPath : undefined
    };
}

function normalizeSearchRequest(body: Record<string, unknown>): ContextSearchRequest {
    if (typeof body.query !== 'string' || !body.query.trim()) {
        throw new Error('query must not be empty.');
    }

    if (body.scopePath !== undefined && body.scopePath !== null && typeof body.scopePath !== 'string') {
        throw new Error('scopePath must be a string.');
    }

    if (body.maxResults !== undefined && body.maxResults !== null) {
        if (typeof body.maxResults !== 'number' || !Number.isFinite(body.maxResults)) {
            throw new Error('maxResults must be a number.');
        }
    }

    return {
        query: body.query,
        scopePath: typeof body.scopePath === 'string' ? body.scopePath : undefined,
        maxResults: typeof body.maxResults === 'number' ? body.maxResults : undefined
    };
}

function setRequestError(c: Context, message: string): void {
    c.set('requestError', { message });
}

export function createContextRouter(options: { service: HttpContextService; config: ServerConfig }) {
    const app = new Hono();
    const { service, config } = options;

    app.use('*', async (c, next) => {
        const origin = c.req.header('origin');
        const corsOrigin = resolveCorsOrigin(origin, config);

        if (origin && !corsOrigin) {
            return c.json({ error: 'Origin not allowed.' }, 403);
        }

        if (c.req.method === 'OPTIONS') {
            if (corsOrigin) {
                applyCorsHeaders(c, corsOrigin);
            }
            return c.body(null, 204);
        }

        await next();

        if (corsOrigin) {
            applyCorsHeaders(c, corsOrigin);
        }
    });

    app.post('/initialize-access', async (c) => {
        try {
            await service.initializeAccess();
            return c.json({ ok: true });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to initialize context access.';
            return c.json({ error: message, code: 'CONTEXT_INITIALIZE_FAILED' }, 400);
        }
    });

    app.post('/get-context', async (c) => {
        try {
            normalizeObjectBody(await readJsonBody(c));
            return c.json(await service.getContext());
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to read workspace context.';
            return c.json({ error: message, code: 'CONTEXT_GET_FAILED' }, 400);
        }
    });

    app.post('/get-conversations', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            return c.json({ conversations: await service.getConversations(normalizeConversationQuery(body)) });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to read document conversations.';
            return c.json({ error: message, code: 'CONTEXT_GET_CONVERSATIONS_FAILED' }, 400);
        }
    });

    app.post('/get-tasks', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            return c.json({
                tasks: await service.getTasks(
                    normalizeOptionalTaskScopePath(body.documentPath, 'documentPath'),
                    normalizeOptionalTaskScopePath(body.agentKey, 'agentKey'),
                    normalizeOptionalBoolean(body.completed, 'completed'),
                    normalizeTaskQueryTag(body.tag),
                    typeof body.documentId === 'string' ? body.documentId : undefined
                )
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to read tasks.';
            return c.json({ error: message, code: 'CONTEXT_GET_TASKS_FAILED' }, 400);
        }
    });

    app.post('/create-task', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            return c.json({ task: await service.createTask(normalizeTaskEnvelope(body)) });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to create task.';
            return c.json({ error: message, code: 'CONTEXT_CREATE_TASK_FAILED' }, 400);
        }
    });

    app.post('/update-task', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            return c.json({ task: await service.updateTask(normalizeTaskEnvelope(body)) });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to update task.';
            return c.json({ error: message, code: 'CONTEXT_UPDATE_TASK_FAILED' }, 400);
        }
    });

    app.post('/delete-task', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            const taskId = body.taskId;
            if (typeof taskId !== 'string' || !taskId.trim()) {
                throw new Error('taskId must not be empty.');
            }

            await service.deleteTask(taskId);
            return c.json({ ok: true });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to delete task.';
            return c.json({ error: message, code: 'CONTEXT_DELETE_TASK_FAILED' }, 400);
        }
    });

    app.post('/set-task-completed', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            const taskId = body.taskId;
            if (typeof taskId !== 'string' || !taskId.trim()) {
                throw new Error('taskId must not be empty.');
            }

            const completed = normalizeOptionalBoolean(body.completed, 'completed');
            if (typeof completed !== 'boolean') {
                throw new Error('completed must be a boolean.');
            }

            return c.json({ task: await service.setTaskCompleted(taskId, completed) });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to update task completion.';
            return c.json({ error: message, code: 'CONTEXT_SET_TASK_COMPLETED_FAILED' }, 400);
        }
    });

    app.post('/get-project-documents', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            return c.json({ documents: await service.getProjectDocuments(normalizeCurNode(body)) });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to read project documents.';
            return c.json({ error: message, code: 'CONTEXT_GET_PROJECT_DOCUMENTS_FAILED' }, 400);
        }
    });

    app.post('/read-document', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            return c.json({ document: await service.readDocument(normalizeRequiredPath(body)) });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to read document.';
            return c.json({ error: message, code: 'CONTEXT_READ_DOCUMENT_FAILED' }, 400);
        }
    });

    app.get('/document-asset', async (c) => {
        try {
            const path = c.req.query('path');
            if (typeof path !== 'string' || !path.trim()) {
                throw new Error('path must not be empty.');
            }

            const document = await service.readDocument(path);

            c.header('Content-Type', document.mimeType);
            c.header('Cache-Control', 'no-store');
            return c.body(Buffer.from(document.dataBase64, 'base64'));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to read document asset.';
            return c.json({ error: message, code: 'CONTEXT_READ_DOCUMENT_ASSET_FAILED' }, 400);
        }
    });

    app.post('/write-document', async (c) => {
        let body: Record<string, unknown> | null = null;
        try {
            body = normalizeObjectBody(await readJsonBody(c));
            const result = await service.writeDocument(normalizeWriteDocumentInput(body));
            return c.json({ ok: true, result });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to write document.';
            setRequestError(c, message);
            console.error('[sync-server] write-document failed', {
                path: typeof body?.path === 'string' ? body.path : undefined,
                mimeType: typeof body?.mimeType === 'string' ? body.mimeType : undefined,
                expectedVersion: typeof body?.expectedVersion === 'string' ? body.expectedVersion : undefined,
                dataBase64Length: typeof body?.dataBase64 === 'string' ? body.dataBase64.length : undefined,
                error: message
            });
            return c.json({ error: message, code: 'CONTEXT_WRITE_DOCUMENT_FAILED' }, 400);
        }
    });

    app.post('/create-node', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            return c.json({ node: await service.createNode(normalizeCreateNodeInput(body)) });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to create node.';
            return c.json({ error: message, code: 'CONTEXT_CREATE_NODE_FAILED' }, 400);
        }
    });

    app.post('/delete-node', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            await service.deleteNode(normalizeRequiredPath(body));
            return c.json({ ok: true });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to delete node.';
            return c.json({ error: message, code: 'CONTEXT_DELETE_NODE_FAILED' }, 400);
        }
    });

    app.post('/rename-node', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            return c.json({ node: await service.renameNode(normalizeRenameNodeInput(body)) });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to rename node.';
            return c.json({ error: message, code: 'CONTEXT_RENAME_NODE_FAILED' }, 400);
        }
    });

    app.post('/move-node', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            return c.json({ node: await service.moveNode(normalizeMoveNodeInput(body)) });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to move node.';
            return c.json({ error: message, code: 'CONTEXT_MOVE_NODE_FAILED' }, 400);
        }
    });

    app.post('/search-in-scope', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            return c.json({ matches: await service.searchInScope(normalizeSearchRequest(body)) });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to search scope.';
            return c.json({ error: message, code: 'CONTEXT_SEARCH_SCOPE_FAILED' }, 400);
        }
    });

    app.post('/get-document-id', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            const path = normalizeRequiredPath(body);
            return c.json({ id: await service.getDocumentId(path) });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to get document ID.';
            return c.json({ error: message, code: 'CONTEXT_GET_DOCUMENT_ID_FAILED' }, 400);
        }
    });

    app.post('/resolve-document-ids', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];
            const result = await service.resolveDocumentIds(ids);
            return c.json({ resolved: Object.fromEntries(result) });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to resolve document IDs.';
            return c.json({ error: message, code: 'CONTEXT_RESOLVE_DOCUMENT_IDS_FAILED' }, 400);
        }
    });

    return app;
}
