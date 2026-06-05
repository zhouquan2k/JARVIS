import { describe, expect, it, vi } from 'vitest';
import { createMockContextProvider } from './createMockContextProvider';

describe('createMockContextProvider.getContext', () => {
    it('builds a full workspace tree with effective agent keys and cached configs', async () => {
        const provider = createMockContextProvider({
            nodes: [
                { path: '/welcome.md', name: 'welcome.md', kind: 'file' },
                { path: '/workspace', name: 'workspace', kind: 'directory' },
                { path: '/workspace/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/workspace' },
                { path: '/workspace/guide.md', name: 'guide.md', kind: 'file', parentPath: '/workspace' },
                { path: '/workspace/archive', name: 'archive', kind: 'directory', parentPath: '/workspace' },
                { path: '/workspace/archive/.agent.json', name: '.agent.json', kind: 'file', parentPath: '/workspace/archive' },
                { path: '/workspace/archive/history.md', name: 'history.md', kind: 'file', parentPath: '/workspace/archive' }
            ],
            documents: {
                '/welcome.md': '# Welcome',
                '/workspace/.agent.json': JSON.stringify({
                    name: 'Workspace Agent',
                    instructions: 'Handle workspace docs.'
                }),
                '/workspace/guide.md': '# Guide',
                '/workspace/archive/.agent.json': JSON.stringify({
                    name: 'Archive Agent',
                    instructions: 'Handle archived docs.'
                }),
                '/workspace/archive/history.md': '# History'
            }
        });

        const context = await provider.getContext();
        const workspaceNode = context.nodes.find((node) => node.path === '/workspace');
        const archiveNode = workspaceNode?.children?.find((node) => node.path === '/workspace/archive');

        expect(context.folderMetadata['/'].data).toMatchObject({
            name: 'Default Knowledge Agent',
            scopePath: '/'
        });
        expect(workspaceNode).toMatchObject({
            ownsMetadata: true,
            scopeKey: '/workspace/'
        });
        expect(archiveNode).toMatchObject({
            ownsMetadata: true,
            scopeKey: '/workspace/archive/'
        });
        expect(context.folderMetadata['/workspace/archive/'].data).toMatchObject({
            scopePath: '/workspace/archive',
            sourcePaths: ['/workspace/.agent.json', '/workspace/archive/.agent.json']
        });
    });

    it('lists markdown documents within the current project scope', async () => {
        const provider = createMockContextProvider({
            nodes: [
                { path: '/workspace', name: 'workspace', kind: 'directory' },
                { path: '/workspace/guide.md', name: 'guide.md', kind: 'file', parentPath: '/workspace' },
                { path: '/workspace/notes.txt', name: 'notes.txt', kind: 'file', parentPath: '/workspace' },
                { path: '/workspace/archive', name: 'archive', kind: 'directory', parentPath: '/workspace' },
                { path: '/workspace/archive/history.markdown', name: 'history.markdown', kind: 'file', parentPath: '/workspace/archive' }
            ],
            documents: {
                '/workspace/guide.md': '# Guide',
                '/workspace/notes.txt': 'ignore',
                '/workspace/archive/history.markdown': '# History'
            }
        });

        await expect(provider.getProjectDocuments('/workspace')).resolves.toEqual([
            { path: '/workspace/archive/history.markdown', name: 'history.markdown' },
            { path: '/workspace/guide.md', name: 'guide.md' }
        ]);
    });

    it('filters document-scoped and project-scoped tasks independently', async () => {
        const provider = createMockContextProvider({
            nodes: [],
            documents: {},
            tasks: [
                {
                    id: 'task-doc',
                    title: 'Document task',
                    notes: '',
                    completed: false,
                    dueAt: null,
                    priority: null,
                    documentPath: '/workspace/guide.md',
                    agentKey: null,
                    createdAt: 1,
                    updatedAt: 2,
                    completedAt: null,
                    calendarProviderId: null,
                    calendarEventId: null,
                    calendarSyncStatus: null,
                    calendarLastSyncedAt: null,
                    calendarLastSyncError: null
                },
                {
                    id: 'task-project',
                    title: 'Project task',
                    notes: '',
                    completed: false,
                    dueAt: null,
                    priority: 'high',
                    documentPath: null,
                    agentKey: '/workspace/',
                    createdAt: 3,
                    updatedAt: 4,
                    completedAt: null,
                    calendarProviderId: null,
                    calendarEventId: null,
                    calendarSyncStatus: null,
                    calendarLastSyncedAt: null,
                    calendarLastSyncError: null
                }
            ]
        });

        const taskProvider = provider.getTaskService();

        await expect(taskProvider.getTasks('/workspace/guide.md', '/workspace/', false)).resolves.toEqual([
            expect.objectContaining({ id: 'task-doc' })
        ]);
        await expect(taskProvider.getTasks(null, '/workspace/', false)).resolves.toEqual([
            expect.objectContaining({ id: 'task-project' })
        ]);
    });

    it('supports global queries and today/planned tags', async () => {
        vi.useFakeTimers();
        try {
            const now = new Date(2026, 4, 31, 10, 0, 0, 0);
            vi.setSystemTime(now);

            const provider = createMockContextProvider({
                nodes: [],
                documents: {},
                tasks: [
                    {
                        id: 'task-today',
                        title: 'Today task',
                        notes: '',
                        completed: false,
                        dueAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0, 0).getTime(),
                        priority: null,
                        documentPath: '/workspace/guide.md',
                        agentKey: null,
                        createdAt: 1,
                        updatedAt: 2,
                        completedAt: null,
                        calendarProviderId: null,
                        calendarEventId: null,
                        calendarSyncStatus: null,
                        calendarLastSyncedAt: null,
                        calendarLastSyncError: null
                    },
                    {
                        id: 'task-planned',
                        title: 'Planned task',
                        notes: '',
                        completed: false,
                        dueAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 9, 0, 0, 0).getTime(),
                        priority: null,
                        documentPath: null,
                        agentKey: '/workspace/',
                        createdAt: 3,
                        updatedAt: 4,
                        completedAt: null,
                        calendarProviderId: null,
                        calendarEventId: null,
                        calendarSyncStatus: null,
                        calendarLastSyncedAt: null,
                        calendarLastSyncError: null
                    }
                ]
            });

            const taskProvider = provider.getTaskService();

            await expect(taskProvider.getTasks(null, null, false, 'all')).resolves.toEqual(expect.arrayContaining([
                expect.objectContaining({ id: 'task-today' }),
                expect.objectContaining({ id: 'task-planned' })
            ]));
            await expect(taskProvider.getTasks(null, null, false, 'today')).resolves.toEqual([
                expect.objectContaining({ id: 'task-today' })
            ]);
            await expect(taskProvider.getTasks(null, null, false, 'planned')).resolves.toEqual(expect.arrayContaining([
                expect.objectContaining({ id: 'task-today' }),
                expect.objectContaining({ id: 'task-planned' })
            ]));
        } finally {
            vi.useRealTimers();
        }
    });

    it('normalizes task system fields when creating and updating tasks', async () => {
        const provider = createMockContextProvider({
            nodes: [],
            documents: {}
        });
        const taskProvider = provider.getTaskService();

        const created = await taskProvider.createTask({
            id: 'temp',
            title: 'Follow up',
            notes: 'Initial',
            completed: false,
            dueAt: null,
            priority: 'medium',
            documentPath: '/docs/guide.md',
            agentKey: '/docs/',
            createdAt: 0,
            updatedAt: 0,
            completedAt: 123,
            calendarProviderId: 'google-calendar',
            calendarEventId: 'event-1',
            calendarSyncStatus: 'synced',
            calendarLastSyncedAt: 456,
            calendarLastSyncError: null
        });

        expect(created.id).toBe('mock-task-1');
        expect(created.documentPath).toBe('/docs/guide.md');
        expect(created.agentKey).toBeNull();
        expect(created.createdAt).toBeGreaterThan(0);
        expect(created.updatedAt).toBe(created.createdAt);
        expect(created.completedAt).toBeNull();
        expect(created.calendarProviderId).toBe('google-calendar');
        expect(created.calendarEventId).toBe('event-1');
        expect(created.calendarSyncStatus).toBe('synced');
        expect(created.calendarLastSyncedAt).toBe(456);
        expect(created.calendarLastSyncError).toBeNull();

        const updated = await taskProvider.updateTask({
            ...created,
            completed: true,
            calendarSyncStatus: 'failed',
            calendarLastSyncError: 'sync failed'
        });

        expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
        expect(updated.completedAt).toBeGreaterThan(0);
        expect(updated.calendarSyncStatus).toBe('failed');
        expect(updated.calendarLastSyncError).toBe('sync failed');
    });

    it('rejects document IDs for non-Markdown files', async () => {
        const provider = createMockContextProvider({
            nodes: [
                { path: '/workspace', name: 'workspace', kind: 'directory' },
                { path: '/workspace/notes.txt', name: 'notes.txt', kind: 'file', parentPath: '/workspace' }
            ],
            documents: {
                '/workspace/notes.txt': 'plain text'
            }
        });

        await expect(provider.getDocumentId('/workspace/notes.txt')).rejects.toThrow(
            'Only Markdown documents can have document IDs.'
        );
    });
});
