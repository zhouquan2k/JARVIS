import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeTextDocument, encodeBase64, encodeTextDocument, type Task } from '@packages/core/src';
import {
    DESKTOP_CONTEXT_CREATE_TASK_CHANNEL,
    DESKTOP_CONTEXT_CREATE_NODE_CHANNEL,
    DESKTOP_CONTEXT_DELETE_TASK_CHANNEL,
    DESKTOP_CONTEXT_DELETE_NODE_CHANNEL,
    DESKTOP_CONTEXT_GET_CONTEXT_CHANNEL,
    DESKTOP_CONTEXT_GET_TASKS_CHANNEL,
    DESKTOP_CONTEXT_GET_PROJECT_DOCUMENTS_CHANNEL,
    DESKTOP_CONTEXT_INITIALIZE_CHANNEL,
    DESKTOP_CONTEXT_MOVE_NODE_CHANNEL,
    DESKTOP_CONTEXT_READ_DOCUMENT_CHANNEL,
    DESKTOP_CONTEXT_RENAME_NODE_CHANNEL,
    DESKTOP_CONTEXT_SEARCH_IN_SCOPE_CHANNEL,
    DESKTOP_CONTEXT_SET_TASK_COMPLETED_CHANNEL,
    DESKTOP_CONTEXT_UPDATE_TASK_CHANNEL,
    DESKTOP_CONTEXT_WRITE_DOCUMENT_CHANNEL
} from '../shared/contextBridge';
import { registerContextIpc, resolveDesktopWorkspaceRoot } from './contextIpc';

function createIpcMock() {
    return {
        handle: vi.fn(),
        removeHandler: vi.fn()
    };
}

function getHandler(ipc: ReturnType<typeof createIpcMock>, channel: string) {
    const matched = ipc.handle.mock.calls.find(([registeredChannel]) => registeredChannel === channel);
    return matched?.[1] as ((...args: any[]) => unknown) | undefined;
}

describe('contextIpc', () => {
    const tempDirs: string[] = [];
    let infoSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;

    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    afterEach(async () => {
        await Promise.all(tempDirs.map((target) => rm(target, { recursive: true, force: true })));
        tempDirs.length = 0;
        infoSpy.mockClear();
        warnSpy.mockClear();
    });

    it('rejects missing CHATPRISM_KNOWLEDGE_ROOT', async () => {
        await expect(resolveDesktopWorkspaceRoot('')).rejects.toThrow(
            'Desktop knowledge workspace root is not configured. Set CHATPRISM_KNOWLEDGE_ROOT.'
        );
    });

    it('rejects invalid workspace roots', async () => {
        const baseDir = await mkdtemp(join(tmpdir(), 'chatprism-context-invalid-'));
        tempDirs.push(baseDir);
        const filePath = join(baseDir, 'not-a-directory.md');
        await writeFile(filePath, '# not a directory\n', 'utf8');

        await expect(resolveDesktopWorkspaceRoot(join(baseDir, 'missing'))).rejects.toThrow('does not exist');
        await expect(resolveDesktopWorkspaceRoot(filePath)).rejects.toThrow('must be a directory');
    });

    it('reads and writes documents inside CHATPRISM_KNOWLEDGE_ROOT', async () => {
        const workspaceRoot = await mkdtemp(join(tmpdir(), 'chatprism-context-valid-'));
        tempDirs.push(workspaceRoot);
        await mkdir(join(workspaceRoot, 'notes'), { recursive: true });
        await writeFile(join(workspaceRoot, 'notes', 'today.md'), '# Today\n\n- hi\n', 'utf8');

        const ipc = createIpcMock();
        const dispose = registerContextIpc({ ipc, workspaceRoot });
        const initializeHandler = getHandler(ipc, DESKTOP_CONTEXT_INITIALIZE_CHANNEL);
        const getContextHandler = getHandler(ipc, DESKTOP_CONTEXT_GET_CONTEXT_CHANNEL);
        const getTasksHandler = getHandler(ipc, DESKTOP_CONTEXT_GET_TASKS_CHANNEL);
        const createTaskHandler = getHandler(ipc, DESKTOP_CONTEXT_CREATE_TASK_CHANNEL);
        const setTaskCompletedHandler = getHandler(ipc, DESKTOP_CONTEXT_SET_TASK_COMPLETED_CHANNEL);
        const getProjectDocumentsHandler = getHandler(ipc, DESKTOP_CONTEXT_GET_PROJECT_DOCUMENTS_CHANNEL);
        const readDocumentHandler = getHandler(ipc, DESKTOP_CONTEXT_READ_DOCUMENT_CHANNEL);
        const searchInScopeHandler = getHandler(ipc, DESKTOP_CONTEXT_SEARCH_IN_SCOPE_CHANNEL);
        const writeDocumentHandler = getHandler(ipc, DESKTOP_CONTEXT_WRITE_DOCUMENT_CHANNEL);

        await initializeHandler?.({});

        const context = await getContextHandler?.({}) as {
            nodes: Array<{ path: string; kind: string }>;
            agentConfigs: Record<string, { scopePath: string; name: string }>;
        };
        expect(context.nodes).toEqual([
            expect.objectContaining({ path: '/notes', kind: 'directory' })
        ]);

        const document = await readDocumentHandler?.({}, '/notes/today.md') as { dataBase64: string };
        expect(decodeTextDocument(document.dataBase64)).toContain('# Today');
        await expect(getProjectDocumentsHandler?.({}, '/notes')).resolves.toEqual([
            { path: '/notes/today.md', name: 'today.md' }
        ]);

        const matches = await searchInScopeHandler?.({}, {
            query: 'Today',
            scopePath: '/notes'
        }) as Array<{ path: string; line: number; column: number }>;
        expect(matches).toEqual([
            expect.objectContaining({ path: '/notes/today.md', line: 1, column: 3 })
        ]);

        expect(context.agentConfigs['/']).toMatchObject({
            scopePath: '/',
            name: 'Default Knowledge Agent'
        });

        await writeDocumentHandler?.({}, {
            path: '/notes/today.md',
            mimeType: 'text/markdown',
            dataBase64: encodeTextDocument('# Updated\n')
        });
        const updatedDocument = await readDocumentHandler?.({}, '/notes/today.md') as { dataBase64: string };
        expect(decodeTextDocument(updatedDocument.dataBase64)).toBe('# Updated\n');

        const createdTask = await createTaskHandler?.({}, {
            id: 'temp-task',
            title: 'Desktop follow-up',
            notes: '',
            completed: false,
            dueAt: null,
            priority: null,
            documentPath: '/notes/today.md',
            agentKey: null,
            createdAt: 0,
            updatedAt: 0,
            completedAt: null,
            calendarProviderId: null,
            calendarEventId: null,
            calendarSyncStatus: null,
            calendarLastSyncedAt: null,
            calendarLastSyncError: null
        }) as { id: string; documentPath: string | null; completed: boolean };
        expect(createdTask.id).toContain('task-');
        await expect(getTasksHandler?.({}, { documentPath: '/notes/today.md', completed: false })).resolves.toEqual([
            expect.objectContaining({ id: createdTask.id, documentPath: '/notes/today.md' })
        ]);
        await expect(setTaskCompletedHandler?.({}, { taskId: createdTask.id, completed: true })).resolves.toEqual(
            expect.objectContaining({ id: createdTask.id, completed: true })
        );

        dispose();
        expect(ipc.removeHandler).toHaveBeenCalledWith(DESKTOP_CONTEXT_INITIALIZE_CHANNEL);
        expect(ipc.removeHandler).toHaveBeenCalledWith(DESKTOP_CONTEXT_GET_CONTEXT_CHANNEL);
        expect(ipc.removeHandler).toHaveBeenCalledWith(DESKTOP_CONTEXT_GET_TASKS_CHANNEL);
        expect(ipc.removeHandler).toHaveBeenCalledWith(DESKTOP_CONTEXT_CREATE_TASK_CHANNEL);
        expect(ipc.removeHandler).toHaveBeenCalledWith(DESKTOP_CONTEXT_UPDATE_TASK_CHANNEL);
        expect(ipc.removeHandler).toHaveBeenCalledWith(DESKTOP_CONTEXT_DELETE_TASK_CHANNEL);
        expect(ipc.removeHandler).toHaveBeenCalledWith(DESKTOP_CONTEXT_SET_TASK_COMPLETED_CHANNEL);
        expect(ipc.removeHandler).toHaveBeenCalledWith(DESKTOP_CONTEXT_GET_PROJECT_DOCUMENTS_CHANNEL);
        expect(ipc.removeHandler).toHaveBeenCalledWith(DESKTOP_CONTEXT_READ_DOCUMENT_CHANNEL);
        expect(ipc.removeHandler).toHaveBeenCalledWith(DESKTOP_CONTEXT_SEARCH_IN_SCOPE_CHANNEL);
        expect(ipc.removeHandler).toHaveBeenCalledWith(DESKTOP_CONTEXT_WRITE_DOCUMENT_CHANNEL);
        expect(ipc.removeHandler).toHaveBeenCalledWith(DESKTOP_CONTEXT_CREATE_NODE_CHANNEL);
        expect(ipc.removeHandler).toHaveBeenCalledWith(DESKTOP_CONTEXT_DELETE_NODE_CHANNEL);
        expect(ipc.removeHandler).toHaveBeenCalledWith(DESKTOP_CONTEXT_RENAME_NODE_CHANNEL);
        expect(ipc.removeHandler).toHaveBeenCalledWith(DESKTOP_CONTEXT_MOVE_NODE_CHANNEL);
    });

    it('passes documentId through the desktop getTasks IPC handler', async () => {
        const workspaceRoot = await mkdtemp(join(tmpdir(), 'chatprism-context-task-query-'));
        tempDirs.push(workspaceRoot);
        await mkdir(join(workspaceRoot, 'notes'), { recursive: true });
        await writeFile(join(workspaceRoot, 'notes', 'today.md'), '# Today\n', 'utf8');

        const ipc = createIpcMock();
        registerContextIpc({ ipc, workspaceRoot });
        const getTasksHandler = getHandler(ipc, DESKTOP_CONTEXT_GET_TASKS_CHANNEL);
        expect(getTasksHandler).toBeDefined();

        const createTaskHandler = getHandler(ipc, DESKTOP_CONTEXT_CREATE_TASK_CHANNEL);
        const createdTask = await createTaskHandler?.({}, {
            id: 'temp-task',
            title: 'Desktop follow-up',
            notes: '',
            completed: false,
            dueAt: null,
            priority: null,
            documentPath: '/notes/today.md',
            documentId: 'doc-123',
            agentKey: null,
            createdAt: 0,
            updatedAt: 0,
            completedAt: null,
            calendarProviderId: null,
            calendarEventId: null,
            calendarSyncStatus: null,
            calendarLastSyncedAt: null,
            calendarLastSyncError: null
        }) as Task;

        await expect(getTasksHandler?.({}, { documentId: 'doc-123', completed: false })).resolves.toEqual([
            expect.objectContaining({ id: createdTask.id, documentId: 'doc-123' })
        ]);
    });

    it('syncs timed tasks through the desktop IPC path and preserves the calendar event id on update', async () => {
        const workspaceRoot = await mkdtemp(join(tmpdir(), 'chatprism-context-sync-'));
        tempDirs.push(workspaceRoot);
        await mkdir(join(workspaceRoot, 'notes'), { recursive: true });
        await writeFile(join(workspaceRoot, 'notes', 'today.md'), '# Today\n', 'utf8');

        const originalEnv = {
            CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID: process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID,
            CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET: process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET,
            CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN: process.env.CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN,
            CHATPRISM_GOOGLE_OAUTH_TOKEN_URL: process.env.CHATPRISM_GOOGLE_OAUTH_TOKEN_URL,
            CHATPRISM_GOOGLE_CALENDAR_API_BASE_URL: process.env.CHATPRISM_GOOGLE_CALENDAR_API_BASE_URL
        };
        process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID = 'client-id';
        process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET = 'client-secret';
        process.env.CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN = 'refresh-token';
        process.env.CHATPRISM_GOOGLE_OAUTH_TOKEN_URL = 'https://oauth.example.test/token';
        process.env.CHATPRISM_GOOGLE_CALENDAR_API_BASE_URL = 'https://calendar.example.test/v3';

        const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url === 'https://oauth.example.test/token') {
                return new Response(JSON.stringify({
                    access_token: 'token-1',
                    expires_in: 3600
                }), { status: 200 });
            }

            if (url.endsWith('/calendars/primary/events')) {
                return new Response(JSON.stringify({ id: 'event-1' }), { status: 200 });
            }

            if (url.endsWith('/calendars/primary/events/event-1')) {
                return new Response(JSON.stringify({ id: 'event-1' }), { status: 200 });
            }

            throw new Error(`unexpected request: ${url}`);
        });

        try {
            const ipc = createIpcMock();
            registerContextIpc({ ipc, workspaceRoot, fetchImpl });
            const createTaskHandler = getHandler(ipc, DESKTOP_CONTEXT_CREATE_TASK_CHANNEL);
            const updateTaskHandler = getHandler(ipc, DESKTOP_CONTEXT_UPDATE_TASK_CHANNEL);
            const dueAt = new Date('2026-05-24T09:00:00-04:00').getTime();

            const created = await createTaskHandler?.({}, {
                id: 'temp-task',
                title: 'Desktop follow-up',
                notes: 'Bring agenda',
                completed: false,
                dueAt,
                priority: 'high',
                documentPath: '/notes/today.md',
                agentKey: null,
                createdAt: 0,
                updatedAt: 0,
                completedAt: null,
                calendarProviderId: null,
                calendarEventId: null,
                calendarSyncStatus: null,
                calendarLastSyncedAt: null,
                calendarLastSyncError: null
            }) as Task;
            expect(created.calendarEventId).toBe('event-1');
            expect(created.calendarSyncStatus).toBe('synced');

            const updated = await updateTaskHandler?.({}, {
                ...created,
                notes: 'Updated notes'
            }) as Task;
            expect(updated.calendarEventId).toBe('event-1');
            expect(updated.calendarSyncStatus).toBe('synced');
            expect(fetchImpl).toHaveBeenCalledWith('https://calendar.example.test/v3/calendars/primary/events/event-1', expect.anything());
        } finally {
            process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID = originalEnv.CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID;
            process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET = originalEnv.CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET;
            process.env.CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN = originalEnv.CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN;
            process.env.CHATPRISM_GOOGLE_OAUTH_TOKEN_URL = originalEnv.CHATPRISM_GOOGLE_OAUTH_TOKEN_URL;
            process.env.CHATPRISM_GOOGLE_CALENDAR_API_BASE_URL = originalEnv.CHATPRISM_GOOGLE_CALENDAR_API_BASE_URL;
        }
    });

    it('syncs a previously unsynced task when a later desktop update adds a concrete due time', async () => {
        const workspaceRoot = await mkdtemp(join(tmpdir(), 'chatprism-context-sync-on-update-'));
        tempDirs.push(workspaceRoot);
        await mkdir(join(workspaceRoot, 'notes'), { recursive: true });
        await writeFile(join(workspaceRoot, 'notes', 'today.md'), '# Today\n', 'utf8');

        const originalEnv = {
            CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID: process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID,
            CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET: process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET,
            CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN: process.env.CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN,
            CHATPRISM_GOOGLE_OAUTH_TOKEN_URL: process.env.CHATPRISM_GOOGLE_OAUTH_TOKEN_URL,
            CHATPRISM_GOOGLE_CALENDAR_API_BASE_URL: process.env.CHATPRISM_GOOGLE_CALENDAR_API_BASE_URL
        };
        process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID = 'client-id';
        process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET = 'client-secret';
        process.env.CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN = 'refresh-token';
        process.env.CHATPRISM_GOOGLE_OAUTH_TOKEN_URL = 'https://oauth.example.test/token';
        process.env.CHATPRISM_GOOGLE_CALENDAR_API_BASE_URL = 'https://calendar.example.test/v3';

        const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url === 'https://oauth.example.test/token') {
                return new Response(JSON.stringify({
                    access_token: 'token-1',
                    expires_in: 3600
                }), { status: 200 });
            }

            if (url.endsWith('/calendars/primary/events')) {
                return new Response(JSON.stringify({ id: 'event-1' }), { status: 200 });
            }

            throw new Error(`unexpected request: ${url}`);
        });

        try {
            const ipc = createIpcMock();
            registerContextIpc({ ipc, workspaceRoot, fetchImpl });
            const createTaskHandler = getHandler(ipc, DESKTOP_CONTEXT_CREATE_TASK_CHANNEL);
            const updateTaskHandler = getHandler(ipc, DESKTOP_CONTEXT_UPDATE_TASK_CHANNEL);

            const created = await createTaskHandler?.({}, {
                id: 'temp-task',
                title: 'Desktop follow-up',
                notes: 'Bring agenda',
                completed: false,
                dueAt: null,
                priority: 'high',
                documentPath: '/notes/today.md',
                agentKey: null,
                createdAt: 0,
                updatedAt: 0,
                completedAt: null,
                calendarProviderId: null,
                calendarEventId: null,
                calendarSyncStatus: null,
                calendarLastSyncedAt: null,
                calendarLastSyncError: null
            }) as Task;
            expect(created.calendarEventId).toBeNull();
            expect(created.calendarSyncStatus).toBeNull();

            const updated = await updateTaskHandler?.({}, {
                ...created,
                dueAt: new Date('2026-05-24T09:00:00-04:00').getTime()
            }) as Task;
            expect(updated.calendarEventId).toBe('event-1');
            expect(updated.calendarSyncStatus).toBe('synced');
            expect(fetchImpl).toHaveBeenCalledWith('https://calendar.example.test/v3/calendars/primary/events', expect.anything());
        } finally {
            process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID = originalEnv.CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID;
            process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET = originalEnv.CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET;
            process.env.CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN = originalEnv.CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN;
            process.env.CHATPRISM_GOOGLE_OAUTH_TOKEN_URL = originalEnv.CHATPRISM_GOOGLE_OAUTH_TOKEN_URL;
            process.env.CHATPRISM_GOOGLE_CALENDAR_API_BASE_URL = originalEnv.CHATPRISM_GOOGLE_CALENDAR_API_BASE_URL;
        }
    });

    it('syncs a date-only task through the desktop IPC path using a default 09:00 calendar time', async () => {
        const workspaceRoot = await mkdtemp(join(tmpdir(), 'chatprism-context-date-only-sync-'));
        tempDirs.push(workspaceRoot);
        await mkdir(join(workspaceRoot, 'notes'), { recursive: true });
        await writeFile(join(workspaceRoot, 'notes', 'today.md'), '# Today\n', 'utf8');

        const originalEnv = {
            CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID: process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID,
            CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET: process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET,
            CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN: process.env.CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN,
            CHATPRISM_GOOGLE_OAUTH_TOKEN_URL: process.env.CHATPRISM_GOOGLE_OAUTH_TOKEN_URL,
            CHATPRISM_GOOGLE_CALENDAR_API_BASE_URL: process.env.CHATPRISM_GOOGLE_CALENDAR_API_BASE_URL
        };
        process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID = 'client-id';
        process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET = 'client-secret';
        process.env.CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN = 'refresh-token';
        process.env.CHATPRISM_GOOGLE_OAUTH_TOKEN_URL = 'https://oauth.example.test/token';
        process.env.CHATPRISM_GOOGLE_CALENDAR_API_BASE_URL = 'https://calendar.example.test/v3';

        const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url === 'https://oauth.example.test/token') {
                return new Response(JSON.stringify({
                    access_token: 'token-1',
                    expires_in: 3600
                }), { status: 200 });
            }

            const payload = JSON.parse(String(init?.body)) as { start: { dateTime: string } };
            expect(new Date(payload.start.dateTime).getHours()).toBe(9);
            expect(new Date(payload.start.dateTime).getMinutes()).toBe(0);
            return new Response(JSON.stringify({ id: 'event-1' }), { status: 200 });
        });

        try {
            const ipc = createIpcMock();
            registerContextIpc({ ipc, workspaceRoot, fetchImpl });
            const createTaskHandler = getHandler(ipc, DESKTOP_CONTEXT_CREATE_TASK_CHANNEL);

            const created = await createTaskHandler?.({}, {
                id: 'temp-task',
                title: 'Desktop date-only follow-up',
                notes: 'Bring agenda',
                completed: false,
                dueAt: new Date('2026-05-24T00:00:00').getTime(),
                priority: 'high',
                documentPath: '/notes/today.md',
                agentKey: null,
                createdAt: 0,
                updatedAt: 0,
                completedAt: null,
                calendarProviderId: null,
                calendarEventId: null,
                calendarSyncStatus: null,
                calendarLastSyncedAt: null,
                calendarLastSyncError: null
            }) as Task;
            expect(created.calendarEventId).toBe('event-1');
            expect(created.calendarSyncStatus).toBe('synced');
        } finally {
            process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID = originalEnv.CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID;
            process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET = originalEnv.CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET;
            process.env.CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN = originalEnv.CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN;
            process.env.CHATPRISM_GOOGLE_OAUTH_TOKEN_URL = originalEnv.CHATPRISM_GOOGLE_OAUTH_TOKEN_URL;
            process.env.CHATPRISM_GOOGLE_CALENDAR_API_BASE_URL = originalEnv.CHATPRISM_GOOGLE_CALENDAR_API_BASE_URL;
        }
    });

    it('rejects node creation attempts that escape the workspace root', async () => {
        const workspaceRoot = await mkdtemp(join(tmpdir(), 'chatprism-context-boundary-'));
        tempDirs.push(workspaceRoot);

        const ipc = createIpcMock();
        registerContextIpc({ ipc, workspaceRoot });
        const createNodeHandler = getHandler(ipc, DESKTOP_CONTEXT_CREATE_NODE_CHANNEL);

        await expect(
            createNodeHandler?.({}, { parentPath: undefined, name: '../escape.md', kind: 'file' })
        ).rejects.toThrow('Node name is invalid.');
    });

    it('deletes files through the desktop IPC handler', async () => {
        const workspaceRoot = await mkdtemp(join(tmpdir(), 'chatprism-context-delete-'));
        tempDirs.push(workspaceRoot);
        await writeFile(join(workspaceRoot, 'draft.md'), '# draft\n', 'utf8');

        const ipc = createIpcMock();
        registerContextIpc({ ipc, workspaceRoot });
        const deleteNodeHandler = getHandler(ipc, DESKTOP_CONTEXT_DELETE_NODE_CHANNEL);
        const getContextHandler = getHandler(ipc, DESKTOP_CONTEXT_GET_CONTEXT_CHANNEL);

        await expect(deleteNodeHandler?.({}, '/draft.md')).resolves.toBeUndefined();
        const context = await getContextHandler?.({}) as { nodes: Array<{ path: string }> };
        expect(context.nodes.some((node) => node.path === '/draft.md')).toBe(false);
    });

    it('renames files through the desktop IPC handler', async () => {
        const workspaceRoot = await mkdtemp(join(tmpdir(), 'chatprism-context-rename-'));
        tempDirs.push(workspaceRoot);
        await writeFile(join(workspaceRoot, 'draft.md'), '# draft\n', 'utf8');

        const ipc = createIpcMock();
        registerContextIpc({ ipc, workspaceRoot });
        const renameNodeHandler = getHandler(ipc, DESKTOP_CONTEXT_RENAME_NODE_CHANNEL);
        const getContextHandler = getHandler(ipc, DESKTOP_CONTEXT_GET_CONTEXT_CHANNEL);

        await expect(renameNodeHandler?.({}, { path: '/draft.md', name: 'renamed.md' })).resolves.toMatchObject({
            path: '/renamed.md',
            name: 'renamed.md',
            kind: 'file'
        });
        const context = await getContextHandler?.({}) as { nodes: Array<{ path: string }> };
        expect(context.nodes.some((node) => node.path === '/renamed.md')).toBe(true);
    });

    it('moves files through the desktop IPC handler', async () => {
        const workspaceRoot = await mkdtemp(join(tmpdir(), 'chatprism-context-move-'));
        tempDirs.push(workspaceRoot);
        await mkdir(join(workspaceRoot, 'archive'), { recursive: true });
        await writeFile(join(workspaceRoot, 'draft.md'), '# draft\n', 'utf8');

        const ipc = createIpcMock();
        registerContextIpc({ ipc, workspaceRoot });
        const moveNodeHandler = getHandler(ipc, DESKTOP_CONTEXT_MOVE_NODE_CHANNEL);
        const getContextHandler = getHandler(ipc, DESKTOP_CONTEXT_GET_CONTEXT_CHANNEL);

        await expect(moveNodeHandler?.({}, { path: '/draft.md', targetParentPath: '/archive' })).resolves.toMatchObject({
            path: '/archive/draft.md',
            name: 'draft.md',
            kind: 'file',
            parentPath: '/archive'
        });
        const context = await getContextHandler?.({}) as { nodes: Array<{ path: string; children?: Array<{ path: string }> }> };
        const archiveNode = context.nodes.find((node) => node.path === '/archive');
        expect(archiveNode?.children?.some((node) => node.path === '/archive/draft.md')).toBe(true);
    });

    it('reads pdf documents as binary context payloads', async () => {
        const workspaceRoot = await mkdtemp(join(tmpdir(), 'chatprism-context-pdf-'));
        tempDirs.push(workspaceRoot);
        const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
        await writeFile(join(workspaceRoot, 'guide.pdf'), pdfBytes);

        const ipc = createIpcMock();
        registerContextIpc({ ipc, workspaceRoot });
        const readDocumentHandler = getHandler(ipc, DESKTOP_CONTEXT_READ_DOCUMENT_CHANNEL);

        await expect(readDocumentHandler?.({}, '/guide.pdf')).resolves.toEqual(
            expect.objectContaining({
                path: '/guide.pdf',
                mimeType: 'application/pdf',
                dataBase64: encodeBase64(pdfBytes),
                canWrite: false
            })
        );
    });

    it('marks directory nodes that own agent configs through the desktop IPC handler', async () => {
        const workspaceRoot = await mkdtemp(join(tmpdir(), 'chatprism-context-agent-dir-'));
        tempDirs.push(workspaceRoot);
        await mkdir(join(workspaceRoot, 'archive'), { recursive: true });
        await writeFile(
            join(workspaceRoot, 'archive', '.agent.json'),
            JSON.stringify({
                name: 'Archive Agent',
                instructions: 'Handle archive content only.'
            }),
            'utf8'
        );

        const ipc = createIpcMock();
        registerContextIpc({ ipc, workspaceRoot });
        const getContextHandler = getHandler(ipc, DESKTOP_CONTEXT_GET_CONTEXT_CHANNEL);

        const context = await getContextHandler?.({}) as {
            nodes: Array<{ path: string; isAgentOwner?: boolean; agentKey?: string }>;
        };
        expect(context.nodes).toEqual([
            expect.objectContaining({
                path: '/archive',
                isAgentOwner: true,
                agentKey: '/archive/'
            })
        ]);
    });

    it('prefers the configured server context provider', async () => {
        const ipc = createIpcMock();
        const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.endsWith('/initialize-access')) {
                return new Response(JSON.stringify({ ok: true }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' }
                });
            }

            if (url.endsWith('/get-context')) {
                return new Response(JSON.stringify({
                    nodes: [{ path: '/server-only', name: 'server-only', kind: 'directory', hasChildren: false }],
                    agentConfigs: { '/': { name: 'Default Knowledge Agent', scopePath: '/', sourcePaths: [], effectiveInstructions: '' } }
                }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' }
                });
            }

            throw new Error(`unexpected request: ${url} ${init?.method ?? 'GET'}`);
        }) as typeof fetch;

        registerContextIpc({
            ipc,
            workspaceRoot: '/should-not-be-used',
            contextBaseUrl: 'http://127.0.0.1:8787/api/context',
            fetchImpl
        });
        const initializeHandler = getHandler(ipc, DESKTOP_CONTEXT_INITIALIZE_CHANNEL);
        const getContextHandler = getHandler(ipc, DESKTOP_CONTEXT_GET_CONTEXT_CHANNEL);

        await expect(initializeHandler?.({})).resolves.toBeUndefined();
        await expect(getContextHandler?.({})).resolves.toMatchObject({
            nodes: [expect.objectContaining({ path: '/server-only' })]
        });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(fetchImpl).toHaveBeenNthCalledWith(
            1,
            'http://127.0.0.1:8787/api/context/initialize-access',
            expect.objectContaining({ method: 'POST' })
        );
        expect(fetchImpl).toHaveBeenNthCalledWith(
            2,
            'http://127.0.0.1:8787/api/context/get-context',
            expect.objectContaining({ method: 'POST' })
        );
        expect(infoSpy).toHaveBeenCalledWith('[desktop-context] using HTTP context provider: http://127.0.0.1:8787/api/context');
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('falls back to the local desktop provider when server base url is not configured', async () => {
        const workspaceRoot = await mkdtemp(join(tmpdir(), 'chatprism-context-fallback-'));
        tempDirs.push(workspaceRoot);
        await writeFile(join(workspaceRoot, 'local.md'), '# local\n', 'utf8');

        const ipc = createIpcMock();
        const fetchImpl = vi.fn() as unknown as typeof fetch;
        registerContextIpc({
            ipc,
            workspaceRoot,
            fetchImpl
        });
        const getContextHandler = getHandler(ipc, DESKTOP_CONTEXT_GET_CONTEXT_CHANNEL);

        await expect(getContextHandler?.({})).resolves.toMatchObject({
            nodes: [expect.objectContaining({ path: '/local.md', kind: 'file' })]
        });
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith('[desktop-context] falling back to local file context provider');
        expect(infoSpy).not.toHaveBeenCalled();
    });
});
