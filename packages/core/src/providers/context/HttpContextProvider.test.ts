import { describe, expect, it } from 'vitest';
import { HttpApiError } from '../../interfaces/HttpApiError';
import { HttpContextProvider } from './HttpContextProvider';

describe('HttpContextProvider', () => {
    it('returns parsed context payloads', async () => {
        const provider = new HttpContextProvider({
            baseUrl: 'http://context.test/api/context',
            fetchImpl: async () => new Response(JSON.stringify({
                nodes: [],
                agentConfigs: {}
            }), {
                status: 200
            })
        });

        await expect(provider.getContext()).resolves.toEqual({
            nodes: [],
            agentConfigs: {}
        });
    });

    it('returns parsed project document payloads', async () => {
        const provider = new HttpContextProvider({
            baseUrl: 'http://context.test/api/context',
            fetchImpl: async () => new Response(JSON.stringify({
                documents: [{ path: '/docs/guide.md', name: 'guide.md' }]
            }), {
                status: 200
            })
        });

        await expect(provider.getProjectDocuments('/docs')).resolves.toEqual([
            { path: '/docs/guide.md', name: 'guide.md' }
        ]);
    });

    it('forwards task operations through the task provider facade', async () => {
        const fetchImpl = async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith('/get-tasks')) {
                return new Response(JSON.stringify({
                    tasks: [{
                        id: 'task-1',
                        title: 'Follow up',
                        notes: '',
                        completed: false,
                        dueAt: null,
                        priority: 'high',
                        documentPath: '/docs/guide.md',
                        agentKey: null,
                        createdAt: 1,
                        updatedAt: 1,
                        completedAt: null,
                        calendarProviderId: null,
                        calendarEventId: null,
                        calendarSyncStatus: null,
                        calendarLastSyncedAt: null,
                        calendarLastSyncError: null
                    }]
                }), { status: 200 });
            }

            if (url.endsWith('/set-task-completed')) {
                return new Response(JSON.stringify({
                    task: {
                        id: 'task-1',
                        title: 'Follow up',
                        notes: '',
                        completed: true,
                        dueAt: null,
                        priority: 'high',
                        documentPath: '/docs/guide.md',
                        agentKey: null,
                        createdAt: 1,
                        updatedAt: 2,
                        completedAt: 2,
                        calendarProviderId: 'google-calendar',
                        calendarEventId: 'event-1',
                        calendarSyncStatus: 'synced',
                        calendarLastSyncedAt: 2,
                        calendarLastSyncError: null
                    }
                }), { status: 200 });
            }

            throw new Error(`unexpected request: ${url}`);
        };
        const provider = new HttpContextProvider({
            baseUrl: 'http://context.test/api/context',
            fetchImpl
        });
        const taskProvider = provider.getTaskProvider();

        await expect(taskProvider.getTasks('/docs/guide.md', null, false)).resolves.toEqual([
            expect.objectContaining({ id: 'task-1', priority: 'high' })
        ]);
        await expect(taskProvider.setTaskCompleted('task-1', true)).resolves.toEqual(
            expect.objectContaining({
                id: 'task-1',
                completed: true,
                completedAt: 2,
                calendarProviderId: 'google-calendar',
                calendarEventId: 'event-1'
            })
        );
    });

    it('normalizes non-2xx errors into HttpApiError', async () => {
        const provider = new HttpContextProvider({
            baseUrl: 'http://context.test/api/context',
            fetchImpl: async () => new Response(JSON.stringify({
                error: 'Failed to read document.',
                code: 'CONTEXT_READ_DOCUMENT_FAILED'
            }), {
                status: 400
            })
        });

        await expect(provider.readDocument('/guide.md')).rejects.toMatchObject({
            name: 'HttpApiError',
            message: 'Failed to read document.',
            status: 400,
            code: 'CONTEXT_READ_DOCUMENT_FAILED',
            source: 'context'
        } satisfies Partial<HttpApiError>);
    });
});
