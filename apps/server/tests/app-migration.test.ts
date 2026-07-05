import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import type { ServerConfig } from '../src/config.js';
import type { ContextProvider } from '../src/types/context.js';
import type { TaskService } from '@plugins/task-mgr/api';

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

async function waitForCondition(assertion: () => Promise<void>, attempts = 20): Promise<void> {
    let lastError: unknown;
    for (let index = 0; index < attempts; index += 1) {
        try {
            await assertion();
            return;
        } catch (error) {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, 10));
        }
    }

    throw lastError;
}

describe('app migration startup', () => {
    const tempRoots: string[] = [];
    const taskService: TaskService = {
        getTasks: vi.fn(async () => []),
        createTask: vi.fn(async (task) => task),
        updateTask: vi.fn(async (task) => task),
        deleteTask: vi.fn(async () => undefined),
        setTaskCompleted: vi.fn(async (_taskId, _completed) => {
            throw new Error('not implemented');
        })
    };

    afterEach(async () => {
        await Promise.all(tempRoots.map(async (root) => {
            await rm(root, { recursive: true, force: true });
        }));
        tempRoots.length = 0;
    });

    it('treats missing migrateNeeded as true and writes false after startup migration', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-server-migration-'));
        tempRoots.push(rootPath);
        await mkdir(path.join(rootPath, '.chatprism'), { recursive: true });
        await writeFile(path.join(rootPath, '.jarvis-meta.json'), JSON.stringify({ jarvis_schema: 1 }, null, 2) + '\n', 'utf8');

        const provider = {
            initializeAccess: vi.fn(async () => undefined),
            getDocumentId: vi.fn(async () => 'doc-1')
        } as unknown as ContextProvider;

        createApp({
            config: createConfig({ knowledgeRoot: rootPath }),
            contextProvider: provider,
            taskService
        });

        await waitForCondition(async () => {
            expect(provider.initializeAccess).toHaveBeenCalledTimes(1);
            const meta = JSON.parse(await readFile(path.join(rootPath, '.jarvis-meta.json'), 'utf8')) as Record<string, unknown>;
            expect(meta.migrateNeeded).toBe(false);
        });
    });

    it('skips startup migration when migrateNeeded is already false', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-server-migration-'));
        tempRoots.push(rootPath);
        await mkdir(path.join(rootPath, '.chatprism'), { recursive: true });
        await writeFile(path.join(rootPath, '.jarvis-meta.json'), JSON.stringify({ migrateNeeded: false }, null, 2) + '\n', 'utf8');

        const provider = {
            initializeAccess: vi.fn(async () => undefined),
            getDocumentId: vi.fn(async () => 'doc-1')
        } as unknown as ContextProvider;

        createApp({
            config: createConfig({ knowledgeRoot: rootPath }),
            contextProvider: provider,
            taskService
        });

        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(provider.initializeAccess).not.toHaveBeenCalled();
    });

    it('imports tasks.json into sync_tasks exactly once on startup', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-server-migration-'));
        tempRoots.push(rootPath);
        await mkdir(path.join(rootPath, '.chatprism'), { recursive: true });
        await writeFile(path.join(rootPath, '.chatprism', 'tasks.json'), JSON.stringify({
            tasks: [
                {
                    id: 'task-1',
                    title: 'Review hub sync',
                    notes: '',
                    completed: false,
                    dueAt: null,
                    priority: 'medium',
                    executionState: null,
                    documentPath: '/docs/guide.md',
                    documentId: 'doc-1',
                    agentKey: '/',
                    createdAt: 100,
                    updatedAt: 100,
                    completedAt: null,
                    calendarProviderId: null,
                    calendarEventId: null,
                    calendarSyncStatus: null,
                    calendarLastSyncedAt: null,
                    calendarLastSyncError: null,
                    recurrence: null
                }
            ]
        }, null, 2) + '\n', 'utf8');

        const app = createApp({
            config: createConfig({
                isDevelopment: true,
                knowledgeRoot: rootPath,
                syncKey: 'dev-local'
            }),
            contextProvider: {
                initializeAccess: vi.fn(async () => undefined),
                getDocumentId: vi.fn(async () => 'doc-1')
            } as unknown as ContextProvider,
            taskService
        });

        await waitForCondition(async () => {
            const pullResponse = await app.request('/api/sync/tasks/pull', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-sync-key': 'dev-local'
                },
                body: JSON.stringify({ cursor: null })
            });
            expect(pullResponse.status).toBe(200);
            await expect(pullResponse.json()).resolves.toMatchObject({
                tasks: [expect.objectContaining({ id: 'task-1', title: 'Review hub sync' })]
            });

            const meta = JSON.parse(await readFile(path.join(rootPath, '.jarvis-meta.json'), 'utf8')) as Record<string, unknown>;
            expect(meta.taskSyncMigrationNeeded).toBe(false);
        });
    });

    it('defers task migration until the first task sync request when startup syncKey is not configured', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-server-migration-'));
        tempRoots.push(rootPath);
        await mkdir(path.join(rootPath, '.chatprism'), { recursive: true });
        await writeFile(path.join(rootPath, '.jarvis-meta.json'), JSON.stringify({ taskSyncMigrationNeeded: true }, null, 2) + '\n', 'utf8');
        await writeFile(path.join(rootPath, '.chatprism', 'tasks.json'), JSON.stringify({
            tasks: [
                {
                    id: 'task-lazy-1',
                    title: 'Lazy import task',
                    notes: '',
                    completed: false,
                    dueAt: null,
                    priority: 'medium',
                    executionState: null,
                    documentPath: '/docs/lazy.md',
                    documentId: 'doc-lazy-1',
                    agentKey: '/',
                    createdAt: 100,
                    updatedAt: 100,
                    completedAt: null,
                    calendarProviderId: null,
                    calendarEventId: null,
                    calendarSyncStatus: null,
                    calendarLastSyncedAt: null,
                    calendarLastSyncError: null,
                    recurrence: null
                }
            ]
        }, null, 2) + '\n', 'utf8');

        const app = createApp({
            config: createConfig({
                isDevelopment: true,
                knowledgeRoot: rootPath
            }),
            contextProvider: {
                initializeAccess: vi.fn(async () => undefined),
                getDocumentId: vi.fn(async () => 'doc-1')
            } as unknown as ContextProvider,
            taskService
        });

        await new Promise((resolve) => setTimeout(resolve, 30));
        const metaBefore = JSON.parse(await readFile(path.join(rootPath, '.jarvis-meta.json'), 'utf8')) as Record<string, unknown>;
        expect(metaBefore.taskSyncMigrationNeeded).toBe(true);

        const pullResponse = await app.request('/api/sync/tasks/pull', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-sync-key': 'workspace-lazy'
            },
            body: JSON.stringify({ cursor: null })
        });

        expect(pullResponse.status).toBe(200);
        await expect(pullResponse.json()).resolves.toMatchObject({
            tasks: [expect.objectContaining({ id: 'task-lazy-1', title: 'Lazy import task' })]
        });

        const metaAfter = JSON.parse(await readFile(path.join(rootPath, '.jarvis-meta.json'), 'utf8')) as Record<string, unknown>;
        expect(metaAfter.taskSyncMigrationNeeded).toBe(false);
    });
});
