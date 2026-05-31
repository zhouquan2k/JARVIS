import { describe, expect, it, vi } from 'vitest';
import { HttpContextService } from '../src/services/httpContextService.js';
import type { ContextProvider } from '../src/types/context.js';
import { encodeTextDocument, type Conversation, type Task } from '@packages/core/src';

function createProvider(): ContextProvider {
    const taskProvider = {
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
    };

    return {
        id: 'test-context',
        initializeAccess: vi.fn(async () => undefined),
        getContext: vi.fn(async () => ({
            nodes: [{ path: '/welcome.md', name: 'welcome.md', kind: 'file', agentKey: '/' }],
            agentConfigs: {}
        })),
        getConversations: vi.fn(async (query: { documentPath?: string }): Promise<Conversation[]> => [{
            id: 'conversation-1',
            title: 'Welcome conversation',
            origin: 'local',
            agentKey: '/',
            documentPaths: query.documentPath ? [query.documentPath] : undefined,
            messages: [],
            updatedAt: 100
        }]),
        getTaskProvider: vi.fn(() => taskProvider),
        getProjectDocuments: vi.fn(async () => [{ path: '/welcome.md', name: 'welcome.md' }]),
        readDocument: vi.fn(async (path: string) => ({ path, mimeType: 'text/markdown', dataBase64: encodeTextDocument('# hello') })),
        writeDocument: vi.fn(async () => ({ version: 'v2', updatedAt: 2 })),
        createNode: vi.fn(async (input) => ({
            path: `${input.parentPath ?? ''}/${input.name}`.replace(/^$/, '/'),
            name: input.name,
            kind: input.kind,
            parentPath: input.parentPath,
            agentKey: '/'
        })),
        deleteNode: vi.fn(async () => undefined),
        renameNode: vi.fn(async (input) => ({
            path: input.path.replace(/[^/]+$/, input.name),
            name: input.name,
            kind: 'file',
            agentKey: '/'
        })),
        moveNode: vi.fn(async (input) => ({
            path: `${input.targetParentPath ?? ''}/${input.path.split('/').pop() ?? ''}`.replace(/^$/, '/'),
            name: input.path.split('/').pop() ?? '',
            kind: 'file',
            parentPath: input.targetParentPath,
            agentKey: '/'
        })),
        searchInScope: vi.fn(async () => [{ path: '/welcome.md', line: 1, column: 3, preview: '# hello' }])
    };
}

describe('http context service', () => {
    it('delegates context operations to the injected provider', async () => {
        const provider = createProvider();
        const service = new HttpContextService(provider);
        const taskProvider = provider.getTaskProvider();

        await service.initializeAccess();
        await expect(service.getContext()).resolves.toEqual({
            nodes: [{ path: '/welcome.md', name: 'welcome.md', kind: 'file', agentKey: '/' }],
            agentConfigs: {}
        });
        await expect(service.getConversations({ documentPath: '/welcome.md' })).resolves.toEqual([
            expect.objectContaining({
                id: 'conversation-1',
                documentPaths: ['/welcome.md']
            })
        ]);
        await expect(service.getTasks('/welcome.md', null, false, 'today')).resolves.toEqual([]);
        await expect(service.getProjectDocuments('/')).resolves.toEqual([
            { path: '/welcome.md', name: 'welcome.md' }
        ]);
        await expect(service.readDocument('/welcome.md')).resolves.toEqual({
            path: '/welcome.md',
            mimeType: 'text/markdown',
            dataBase64: encodeTextDocument('# hello')
        });
        await expect(service.writeDocument({
            path: '/welcome.md',
            mimeType: 'text/markdown',
            dataBase64: encodeTextDocument('# updated')
        })).resolves.toEqual({ version: 'v2', updatedAt: 2 });
        await expect(service.createNode({
            parentPath: '/notes',
            name: 'draft.md',
            kind: 'file'
        })).resolves.toMatchObject({
            name: 'draft.md',
            kind: 'file'
        });
        await expect(service.deleteNode('/notes/draft.md')).resolves.toBeUndefined();
        await expect(service.renameNode({
            path: '/notes/draft.md',
            name: 'renamed.md'
        })).resolves.toMatchObject({
            path: '/notes/renamed.md',
            name: 'renamed.md'
        });
        await expect(service.moveNode({
            path: '/notes/renamed.md',
            targetParentPath: '/archive'
        })).resolves.toMatchObject({
            path: '/archive/renamed.md',
            name: 'renamed.md'
        });
        await expect(service.searchInScope({
            query: 'hello',
            scopePath: '/',
            maxResults: 5
        })).resolves.toEqual([
            { path: '/welcome.md', line: 1, column: 3, preview: '# hello' }
        ]);
        expect(provider.initializeAccess).toHaveBeenCalledTimes(1);
        expect(provider.getContext).toHaveBeenCalledTimes(1);
        expect(provider.getConversations).toHaveBeenCalledWith({ documentPath: '/welcome.md' });
        expect(taskProvider.getTasks).toHaveBeenCalledWith('/welcome.md', null, false, 'today', undefined);
        expect(provider.getProjectDocuments).toHaveBeenCalledWith('/');
        expect(provider.readDocument).toHaveBeenCalledWith('/welcome.md');
        expect(provider.writeDocument).toHaveBeenCalledWith({
            path: '/welcome.md',
            mimeType: 'text/markdown',
            dataBase64: encodeTextDocument('# updated')
        });
        expect(provider.createNode).toHaveBeenCalledWith({
            parentPath: '/notes',
            name: 'draft.md',
            kind: 'file'
        });
        expect(provider.deleteNode).toHaveBeenCalledWith('/notes/draft.md');
        expect(provider.renameNode).toHaveBeenCalledWith({
            path: '/notes/draft.md',
            name: 'renamed.md'
        });
        expect(provider.moveNode).toHaveBeenCalledWith({
            path: '/notes/renamed.md',
            targetParentPath: '/archive'
        });
        expect(provider.searchInScope).toHaveBeenCalledWith({
            query: 'hello',
            scopePath: '/',
            maxResults: 5
        });
    });
});
