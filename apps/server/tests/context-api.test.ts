import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeBase64, encodeTextDocument, type Task } from '@packages/core/src';
import { createApp } from '../src/app.js';
import type { ServerConfig } from '../src/config.js';
import type { ContextProvider } from '../src/types/context.js';

function createConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
    return {
        port: 8787,
        dbPath: ':memory:',
        isDevelopment: false,
        corsAllowlist: ['https://chatprism.test'],
        knowledgeRoot: undefined,
        contextBackend: 'local-file',
        codexCommand: 'codex',
        codexWorkingDirectory: process.cwd(),
        ...overrides
    };
}

describe('context api', () => {
    const tempRoots: string[] = [];
    const originalEnv = {
        CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID: process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID,
        CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET: process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET,
        CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN: process.env.CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN,
        CHATPRISM_GOOGLE_CALENDAR_ID: process.env.CHATPRISM_GOOGLE_CALENDAR_ID,
        CHATPRISM_GOOGLE_OAUTH_TOKEN_URL: process.env.CHATPRISM_GOOGLE_OAUTH_TOKEN_URL,
        CHATPRISM_GOOGLE_CALENDAR_API_BASE_URL: process.env.CHATPRISM_GOOGLE_CALENDAR_API_BASE_URL
    };

    afterEach(async () => {
        await Promise.all(tempRoots.map(async (root) => {
            await import('node:fs/promises').then(({ rm }) => rm(root, { recursive: true, force: true }));
        }));
        tempRoots.length = 0;
        restoreEnv('CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID', originalEnv.CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID);
        restoreEnv('CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET', originalEnv.CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET);
        restoreEnv('CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN', originalEnv.CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN);
        restoreEnv('CHATPRISM_GOOGLE_CALENDAR_ID', originalEnv.CHATPRISM_GOOGLE_CALENDAR_ID);
        restoreEnv('CHATPRISM_GOOGLE_OAUTH_TOKEN_URL', originalEnv.CHATPRISM_GOOGLE_OAUTH_TOKEN_URL);
        restoreEnv('CHATPRISM_GOOGLE_CALENDAR_API_BASE_URL', originalEnv.CHATPRISM_GOOGLE_CALENDAR_API_BASE_URL);
        vi.unstubAllGlobals();
    });

    it('supports initialize list read write and create semantics through /api/context', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-context-'));
        tempRoots.push(rootPath);
        await mkdir(path.join(rootPath, 'notes'));
        await writeFile(path.join(rootPath, 'welcome.md'), '# Welcome\n');
        await writeFile(path.join(rootPath, 'notes', 'today.md'), '# Today\n');

        const app = createApp({
            config: createConfig({
                isDevelopment: true,
                knowledgeRoot: rootPath
            })
        });

        const initialized = await app.request('/api/context/initialize-access', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}'
        });
        expect(initialized.status).toBe(200);
        await expect(initialized.json()).resolves.toEqual({ ok: true });

        const listRoot = await app.request('/api/context/get-context', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}'
        });
        expect(listRoot.status).toBe(200);
        await expect(listRoot.json()).resolves.toMatchObject({
            nodes: expect.arrayContaining([
                expect.objectContaining({ path: '/notes', kind: 'directory' }),
                expect.objectContaining({ path: '/welcome.md', kind: 'file' })
            ]),
            agentConfigs: expect.any(Object)
        });

        const readDocumentResponse = await app.request('/api/context/read-document', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: '/welcome.md' })
        });
        expect(readDocumentResponse.status).toBe(200);
        await expect(readDocumentResponse.json()).resolves.toMatchObject({
            document: expect.objectContaining({
                path: '/welcome.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Welcome\n')
            })
        });

        const writeDocumentResponse = await app.request('/api/context/write-document', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                path: '/welcome.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Updated\n')
            })
        });
        expect(writeDocumentResponse.status).toBe(200);
        await expect(writeDocumentResponse.json()).resolves.toEqual({
            ok: true,
            result: {
                updatedAt: expect.any(Number),
                version: expect.any(String)
            }
        });
        await expect(readFile(path.join(rootPath, 'welcome.md'), 'utf8')).resolves.toBe('# Updated\n');

        const createNodeResponse = await app.request('/api/context/create-node', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                parentPath: '/notes',
                name: 'draft.md',
                kind: 'file'
            })
        });
        expect(createNodeResponse.status).toBe(200);
        await expect(createNodeResponse.json()).resolves.toMatchObject({
            node: expect.objectContaining({
                path: '/notes/draft.md',
                kind: 'file'
            })
        });
        await expect(readFile(path.join(rootPath, 'notes', 'draft.md'), 'utf8')).resolves.toContain('jarvis_id:');

        const deleteNodeResponse = await app.request('/api/context/delete-node', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: '/notes/draft.md' })
        });
        expect(deleteNodeResponse.status).toBe(200);
        await expect(deleteNodeResponse.json()).resolves.toEqual({ ok: true });

        const renameNodeResponse = await app.request('/api/context/rename-node', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: '/welcome.md', name: 'welcome-renamed.md' })
        });
        expect(renameNodeResponse.status).toBe(200);
        await expect(renameNodeResponse.json()).resolves.toMatchObject({
            node: expect.objectContaining({
                path: '/welcome-renamed.md',
                name: 'welcome-renamed.md',
                kind: 'file'
            })
        });

        const moveNodeResponse = await app.request('/api/context/move-node', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: '/welcome-renamed.md', targetParentPath: '/notes' })
        });
        expect(moveNodeResponse.status).toBe(200);
        await expect(moveNodeResponse.json()).resolves.toMatchObject({
            node: expect.objectContaining({
                path: '/notes/welcome-renamed.md',
                name: 'welcome-renamed.md',
                kind: 'file',
                parentPath: '/notes'
            })
        });

        const refreshedContextResponse = await app.request('/api/context/get-context', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}'
        });
        expect(refreshedContextResponse.status).toBe(200);

        const listDocumentConversationsResponse = await app.request('/api/context/get-conversations', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ documentPath: '/welcome-renamed.md' })
        });
        expect(listDocumentConversationsResponse.status).toBe(200);
        await expect(listDocumentConversationsResponse.json()).resolves.toEqual({ conversations: [] });

        const createTaskResponse = await app.request('/api/context/create-task', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                task: {
                    id: 'temp-task',
                    title: 'Review welcome doc',
                    notes: '',
                    completed: false,
                    dueAt: null,
                    priority: 'medium',
                    documentPath: '/welcome-renamed.md',
                    agentKey: '/notes/',
                    createdAt: 0,
                    updatedAt: 0,
                    completedAt: null,
                    calendarProviderId: null,
                    calendarEventId: null,
                    calendarSyncStatus: null,
                    calendarLastSyncedAt: null,
                    calendarLastSyncError: null
                }
            })
        });
        expect(createTaskResponse.status).toBe(200);
        const createdTaskJson = await createTaskResponse.json() as { task: Task };
        expect(createdTaskJson.task.id).toContain('task-');
        expect(createdTaskJson.task.agentKey).toBe('/notes/');
        expect(createdTaskJson.task.documentPath).toBe('/welcome-renamed.md');

        const listTasksResponse = await app.request('/api/context/get-tasks', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                documentPath: '/welcome-renamed.md',
                completed: false,
                tag: 'all'
            })
        });
        expect(listTasksResponse.status).toBe(200);
        await expect(listTasksResponse.json()).resolves.toEqual({
            tasks: [expect.objectContaining({ id: createdTaskJson.task.id, title: 'Review welcome doc' })]
        });

        const globalListResponse = await app.request('/api/context/get-tasks', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                documentPath: null,
                agentKey: null,
                completed: false,
                tag: 'today'
            })
        });
        expect(globalListResponse.status).toBe(200);
        await expect(globalListResponse.json()).resolves.toEqual({ tasks: [] });
    });

    it('reads pdf documents through /api/context/read-document with binary payload and read-only metadata', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-context-'));
        tempRoots.push(rootPath);
        const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
        await writeFile(path.join(rootPath, 'guide.pdf'), pdfBytes);

        const app = createApp({
            config: createConfig({
                isDevelopment: true,
                knowledgeRoot: rootPath
            })
        });

        const readDocumentResponse = await app.request('/api/context/read-document', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: '/guide.pdf' })
        });

        expect(readDocumentResponse.status).toBe(200);
        await expect(readDocumentResponse.json()).resolves.toMatchObject({
            document: {
                path: '/guide.pdf',
                mimeType: 'application/pdf',
                dataBase64: encodeBase64(pdfBytes),
                canWrite: false
            }
        });
    });

    it('logs write-document failures with request metadata and exposes the error in access logs', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

        const app = createApp({
            config: createConfig({
                isDevelopment: true
            }),
            contextProvider: {
                initializeAccess: vi.fn(async () => {}),
                getContext: vi.fn(async () => ({ nodes: [], agentConfigs: {} })),
                getConversations: vi.fn(async () => []),
                getTaskProvider: vi.fn(() => ({
                    getTasks: vi.fn(async (): Promise<Task[]> => []),
                    createTask: vi.fn(async (task: Task): Promise<Task> => task),
                    updateTask: vi.fn(async (task: Task): Promise<Task> => task),
                    deleteTask: vi.fn(async () => undefined),
                    setTaskCompleted: vi.fn(async (taskId: string, completed: boolean): Promise<Task> => ({
                        id: taskId,
                        title: 'Task',
                        notes: '',
                        completed,
                        dueAt: null,
                        priority: null,
                        documentPath: null,
                        agentKey: '/',
                        createdAt: 1,
                        updatedAt: 2,
                        completedAt: completed ? 2 : null,
                        calendarProviderId: null,
                        calendarEventId: null,
                        calendarSyncStatus: null,
                        calendarLastSyncedAt: null,
                        calendarLastSyncError: null
                    }))
                })),
                getProjectDocuments: vi.fn(async () => []),
                readDocument: vi.fn(),
                writeDocument: vi.fn(async () => {
                    throw new Error('The document version has changed. Please reload and try again.');
                }),
                createNode: vi.fn(),
                deleteNode: vi.fn(async () => {}),
                renameNode: vi.fn(),
                searchInScope: vi.fn(async () => [])
            } as unknown as ContextProvider
        });

        const response = await app.request('/api/context/write-document', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                path: '/welcome.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Updated\n'),
                expectedVersion: 'v1'
            })
        });

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
            error: 'The document version has changed. Please reload and try again.',
            code: 'CONTEXT_WRITE_DOCUMENT_FAILED'
        });
        expect(consoleError).toHaveBeenCalledWith('[sync-server] write-document failed', {
            path: '/welcome.md',
            mimeType: 'text/markdown',
            expectedVersion: 'v1',
            dataBase64Length: encodeTextDocument('# Updated\n').length,
            error: 'The document version has changed. Please reload and try again.'
        });
        expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining('error=\"The document version has changed. Please reload and try again.\"'));
    });

    it('serves image documents through /api/context/document-asset', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-context-'));
        tempRoots.push(rootPath);
        const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
        const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
        await mkdir(path.join(rootPath, 'images'));
        await writeFile(path.join(rootPath, 'images', 'flow.png'), imageBytes);
        await writeFile(path.join(rootPath, 'welcome.md'), '# Welcome\n');
        await writeFile(path.join(rootPath, 'guide.pdf'), pdfBytes);

        const app = createApp({
            config: createConfig({
                isDevelopment: true,
                knowledgeRoot: rootPath
            })
        });

        const imageResponse = await app.request('/api/context/document-asset?path=%2Fimages%2Fflow.png', {
            method: 'GET'
        });
        expect(imageResponse.status).toBe(200);
        expect(imageResponse.headers.get('content-type')).toContain('image/png');
        expect(new Uint8Array(await imageResponse.arrayBuffer())).toEqual(imageBytes);

        const markdownResponse = await app.request('/api/context/document-asset?path=%2Fwelcome.md', {
            method: 'GET'
        });
        expect(markdownResponse.status).toBe(200);
        expect(markdownResponse.headers.get('content-type')).toContain('text/markdown');
        expect(await markdownResponse.text()).toBe('# Welcome\n');

        const pdfResponse = await app.request('/api/context/document-asset?path=%2Fguide.pdf', {
            method: 'GET'
        });
        expect(pdfResponse.status).toBe(200);
        expect(pdfResponse.headers.get('content-type')).toContain('application/pdf');
        expect(new Uint8Array(await pdfResponse.arrayBuffer())).toEqual(pdfBytes);
    });

    it('rejects out-of-root traversal and supports context route cors', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-context-'));
        tempRoots.push(rootPath);
        await writeFile(path.join(rootPath, 'welcome.md'), '# Welcome\n');

        const app = createApp({
            config: createConfig({
                knowledgeRoot: rootPath
            })
        });

        const preflight = await app.request('/api/context/read-document', {
            method: 'OPTIONS',
            headers: {
                Origin: 'https://chatprism.test',
                'Access-Control-Request-Method': 'POST'
            }
        });
        expect(preflight.status).toBe(204);
        expect(preflight.headers.get('access-control-allow-origin')).toBe('https://chatprism.test');

        const rejected = await app.request('/api/context/read-document', {
            method: 'POST',
            headers: {
                Origin: 'https://chatprism.test',
                'content-type': 'application/json'
            },
            body: JSON.stringify({ path: '/../secret.md' })
        });
        expect(rejected.status).toBe(400);
        await expect(rejected.json()).resolves.toEqual({
            error: 'Path escapes the knowledge workspace root: /../secret.md',
            code: 'CONTEXT_READ_DOCUMENT_FAILED'
        });
    });

    it('syncs timed tasks through the server /api/context path when Google Calendar config is present', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-context-'));
        tempRoots.push(rootPath);
        await writeFile(path.join(rootPath, 'welcome.md'), '# Welcome\n');

        process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID = 'client-id';
        process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET = 'client-secret';
        process.env.CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN = 'refresh-token';
        process.env.CHATPRISM_GOOGLE_CALENDAR_ID = 'primary';
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

            if (url === 'https://calendar.example.test/v3/calendars/primary/events') {
                return new Response(JSON.stringify({ id: 'event-1' }), { status: 200 });
            }

            throw new Error(`unexpected request: ${url}`);
        });
        vi.stubGlobal('fetch', fetchImpl);

        const app = createApp({
            config: createConfig({
                isDevelopment: true,
                knowledgeRoot: rootPath
            })
        });

        const dueAt = new Date('2026-05-24T09:00:00-04:00').getTime();
        const createTaskResponse = await app.request('/api/context/create-task', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                task: {
                    id: 'temp-task',
                    title: 'Review welcome doc',
                    notes: 'Bring agenda',
                    completed: false,
                    dueAt,
                    priority: 'medium',
                    documentPath: '/welcome.md',
                    agentKey: null,
                    createdAt: 0,
                    updatedAt: 0,
                    completedAt: null,
                    calendarProviderId: null,
                    calendarEventId: null,
                    calendarSyncStatus: null,
                    calendarLastSyncedAt: null,
                    calendarLastSyncError: null
                }
            })
        });

        expect(createTaskResponse.status).toBe(200);
        await expect(createTaskResponse.json()).resolves.toEqual({
            task: expect.objectContaining({
                calendarProviderId: 'google-calendar',
                calendarEventId: 'event-1',
                calendarSyncStatus: 'synced',
                calendarLastSyncedAt: expect.any(Number),
                calendarLastSyncError: null
            })
        });
        expect(fetchImpl).toHaveBeenCalledWith('https://oauth.example.test/token', expect.anything());
        expect(fetchImpl).toHaveBeenCalledWith('https://calendar.example.test/v3/calendars/primary/events', expect.anything());
    });

    it('deletes synced calendar events through the server /api/context path', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-context-'));
        tempRoots.push(rootPath);
        await writeFile(path.join(rootPath, 'welcome.md'), '# Welcome\n');

        process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID = 'client-id';
        process.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET = 'client-secret';
        process.env.CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN = 'refresh-token';
        process.env.CHATPRISM_GOOGLE_CALENDAR_ID = 'primary';
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

            if (url === 'https://calendar.example.test/v3/calendars/primary/events') {
                return new Response(JSON.stringify({ id: 'event-1' }), { status: 200 });
            }

            if (url === 'https://calendar.example.test/v3/calendars/primary/events/event-1') {
                return new Response(null, { status: 204 });
            }

            throw new Error(`unexpected request: ${url}`);
        });
        vi.stubGlobal('fetch', fetchImpl);

        const app = createApp({
            config: createConfig({
                isDevelopment: true,
                knowledgeRoot: rootPath
            })
        });

        const dueAt = new Date('2026-05-24T09:00:00-04:00').getTime();
        const createTaskResponse = await app.request('/api/context/create-task', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                task: {
                    id: 'temp-task',
                    title: 'Review welcome doc',
                    notes: '',
                    completed: false,
                    dueAt,
                    priority: 'medium',
                    documentPath: '/welcome.md',
                    agentKey: null,
                    createdAt: 0,
                    updatedAt: 0,
                    completedAt: null,
                    calendarProviderId: null,
                    calendarEventId: null,
                    calendarSyncStatus: null,
                    calendarLastSyncedAt: null,
                    calendarLastSyncError: null
                }
            })
        });
        const createdTaskJson = await createTaskResponse.json() as { task: Task };

        const deleteTaskResponse = await app.request('/api/context/delete-task', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ taskId: createdTaskJson.task.id })
        });

        expect(deleteTaskResponse.status).toBe(200);
        await expect(deleteTaskResponse.json()).resolves.toEqual({ ok: true });
        expect(fetchImpl).toHaveBeenCalledWith('https://calendar.example.test/v3/calendars/primary/events/event-1', expect.objectContaining({
            method: 'DELETE'
        }));
    });

    it('keeps the route swappable through an injected context provider', async () => {
        const provider: ContextProvider = {
            id: 'fake-context',
            initializeAccess: vi.fn(async () => undefined),
            getContext: vi.fn(async () => ({
                nodes: [{ path: '/virtual.md', name: 'virtual.md', kind: 'file', agentKey: '/' }],
                agentConfigs: {}
            })),
            getConversations: vi.fn(async (query: { documentPath?: string }) => [{
                id: 'conversation-1',
                title: 'Virtual conversation',
                origin: 'local',
                documentPaths: query.documentPath ? [query.documentPath] : undefined,
                messages: [],
                updatedAt: 100
            }]),
            getTaskProvider: vi.fn(() => ({
                getTasks: vi.fn(async (): Promise<Task[]> => []),
                createTask: vi.fn(async (task: Task): Promise<Task> => task),
                updateTask: vi.fn(async (task: Task): Promise<Task> => task),
                deleteTask: vi.fn(async () => undefined),
                setTaskCompleted: vi.fn(async (taskId: string, completed: boolean): Promise<Task> => ({
                    id: taskId,
                    title: 'Task',
                    notes: '',
                    completed,
                    dueAt: null,
                    priority: null,
                    documentPath: null,
                    agentKey: '/',
                    createdAt: 1,
                    updatedAt: 2,
                    completedAt: completed ? 2 : null,
                    calendarProviderId: null,
                    calendarEventId: null,
                    calendarSyncStatus: null,
                    calendarLastSyncedAt: null,
                    calendarLastSyncError: null
                }))
            })),
            getProjectDocuments: vi.fn(async () => [{ path: '/virtual.md', name: 'virtual.md' }]),
            readDocument: vi.fn(async (filePath: string) => ({
                path: filePath,
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('virtual'),
                canWrite: true
            })),
            writeDocument: vi.fn(async () => ({ version: 'virtual-v2', updatedAt: 2 })),
            createNode: vi.fn(async (input) => ({
                path: `/${input.name}`,
                name: input.name,
                kind: input.kind,
                agentKey: '/'
            })),
            deleteNode: vi.fn(async () => undefined),
            renameNode: vi.fn(async (input) => ({
                path: `/${input.name}`,
                name: input.name,
                kind: 'file',
                agentKey: '/'
            })),
            searchInScope: vi.fn(async () => [])
        };

        const app = createApp({
            config: createConfig({ isDevelopment: true }),
            contextProvider: provider
        });

        const response = await app.request('/api/context/get-context', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}'
        });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            nodes: [{ path: '/virtual.md', name: 'virtual.md', kind: 'file', agentKey: '/' }],
            agentConfigs: {}
        });
        expect(provider.getContext).toHaveBeenCalledTimes(1);

        const listDocumentConversationsResponse = await app.request('/api/context/get-conversations', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ documentPath: '/virtual.md' })
        });

        expect(listDocumentConversationsResponse.status).toBe(200);
        await expect(listDocumentConversationsResponse.json()).resolves.toEqual({
            conversations: [
                expect.objectContaining({
                    id: 'conversation-1',
                    documentPaths: ['/virtual.md']
                })
            ]
        });
        expect(provider.getConversations).toHaveBeenCalledWith({ documentPath: '/virtual.md' });
    });
});

function restoreEnv(key: string, value: string | undefined): void {
    if (value === undefined) {
        delete process.env[key];
        return;
    }
    process.env[key] = value;
}
