import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import type { ServerConfig } from '../src/config.js';

function createConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
    return {
        port: 8787,
        dbPath: ':memory:',
        isDevelopment: false,
        corsAllowlist: ['https://chatprism.test'],
        contextBackend: 'local-file',
        codexCommand: 'codex',
        codexWorkingDirectory: process.cwd(),
        ...overrides
    };
}

function createConversationPayload(id: string, updatedAt: number, extra: Record<string, unknown> = {}) {
    return {
        id,
        title: `Conversation ${id}`,
        updatedAt,
        messages: [
            {
                id: `${id}-m1`,
                role: 'user',
                content: `message:${id}`
            }
        ],
        ...extra
    };
}

describe('sync api', () => {
    it('reports readiness from /health', async () => {
        const app = createApp({ config: createConfig({ isDevelopment: true }) });
        const response = await app.request('/health');

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ status: 'ok' });
    });

    it('validates syncKey and request payloads', async () => {
        const app = createApp({ config: createConfig() });

        const missingSyncKey = await app.request('/api/sync/push', {
            method: 'POST',
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify({ conversations: [] })
        });
        expect(missingSyncKey.status).toBe(400);

        const defaultSyncKey = await app.request('/api/sync/push', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-sync-key': '0'
            },
            body: JSON.stringify({ conversations: [] })
        });
        expect(defaultSyncKey.status).toBe(400);

        const malformedConversation = await app.request('/api/sync/push', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-sync-key': 'workspace-a'
            },
            body: JSON.stringify({
                conversations: [
                    {
                        id: 'broken',
                        title: '',
                        messages: [],
                        updatedAt: 'bad'
                    }
                ]
            })
        });
        expect(malformedConversation.status).toBe(400);
    });

    it('supports CORS, namespace isolation, compare stripping and incremental pull', async () => {
        const app = createApp({ config: createConfig() });

        const preflight = await app.request('/api/sync/push', {
            method: 'OPTIONS',
            headers: {
                Origin: 'https://chatprism.test',
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'content-type,x-sync-key'
            }
        });
        expect(preflight.status).toBe(204);
        expect(preflight.headers.get('access-control-allow-origin')).toBe('https://chatprism.test');
        expect(preflight.headers.get('access-control-allow-headers')).toContain('x-sync-key');

        const rejectedOrigin = await app.request('/api/sync/push', {
            method: 'OPTIONS',
            headers: {
                Origin: 'https://evil.test',
                'Access-Control-Request-Method': 'POST'
            }
        });
        expect(rejectedOrigin.status).toBe(403);

        const pushResponse = await app.request('/api/sync/push', {
            method: 'POST',
            headers: {
                Origin: 'https://chatprism.test',
                'content-type': 'application/json',
                'x-sync-key': 'workspace-a'
            },
            body: JSON.stringify({
                conversations: [
                    createConversationPayload('conv-1', 100, {
                        agentKey: '/workspace/.agent.json',
                        origin: 'chatgpt-web',
                        externalId: 'import-1',
                        compare: {
                            prompt: 'should-be-dropped'
                        }
                    })
                ]
            })
        });
        expect(pushResponse.status).toBe(200);
        await expect(pushResponse.json()).resolves.toEqual({
            processedIds: ['conv-1'],
            processedDeletedIds: [],
            nextCursor: 1
        });

        const otherNamespacePush = await app.request('/api/sync/push', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-sync-key': 'workspace-b'
            },
            body: JSON.stringify({
                conversations: [createConversationPayload('conv-2', 200)]
            })
        });
        expect(otherNamespacePush.status).toBe(200);

        const workspaceAPull = await app.request('/api/sync/pull', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-sync-key': 'workspace-a'
            },
            body: JSON.stringify({ cursor: null })
        });
        expect(workspaceAPull.status).toBe(200);
        await expect(workspaceAPull.json()).resolves.toEqual({
            conversations: [
                {
                    id: 'conv-1',
                    title: 'Conversation conv-1',
                    agentKey: '/workspace/.agent.json',
                    updatedAt: 100,
                    origin: 'chatgpt-web',
                    externalId: 'import-1',
                    messages: [
                        {
                            id: 'conv-1-m1',
                            role: 'user',
                            content: 'message:conv-1'
                        }
                    ]
                }
            ],
            deletedConversations: [],
            nextCursor: 1
        });

        const incrementalPull = await app.request('/api/sync/pull', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-sync-key': 'workspace-a'
            },
            body: JSON.stringify({ cursor: 1 })
        });
        expect(incrementalPull.status).toBe(200);
        await expect(incrementalPull.json()).resolves.toEqual({
            conversations: [],
            deletedConversations: [],
            nextCursor: 1
        });
    });

    it('preserves agentKey across push and pull', async () => {
        const app = createApp({ config: createConfig({ isDevelopment: true }) });

        const pushResponse = await app.request('/api/sync/push', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-sync-key': 'workspace-agent'
            },
            body: JSON.stringify({
                conversations: [
                    createConversationPayload('conv-agent', 100, {
                        agentKey: '/workspace/archive/.agent.json'
                    })
                ]
            })
        });

        expect(pushResponse.status).toBe(200);

        const pullResponse = await app.request('/api/sync/pull', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-sync-key': 'workspace-agent'
            },
            body: JSON.stringify({ cursor: null })
        });

        expect(pullResponse.status).toBe(200);
        await expect(pullResponse.json()).resolves.toEqual({
            conversations: [
                {
                    id: 'conv-agent',
                    title: 'Conversation conv-agent',
                    agentKey: '/workspace/archive/.agent.json',
                    updatedAt: 100,
                    messages: [
                        {
                            id: 'conv-agent-m1',
                            role: 'user',
                            content: 'message:conv-agent'
                        }
                    ]
                }
            ],
            deletedConversations: [],
            nextCursor: 1
        });
    });

    it('preserves the group model selection across push and pull', async () => {
        const app = createApp({ config: createConfig({ isDevelopment: true }) });

        const pushResponse = await app.request('/api/sync/push', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-sync-key': 'workspace-group'
            },
            body: JSON.stringify({
                conversations: [
                    createConversationPayload('conv-group', 100, {
                        modelSelection: {
                            providerId: 'group',
                            modelId: 'dom',
                            modelOptions: { web_search: true },
                            reasoningEffort: 'high',
                            explicit: true,
                            groupMembers: [
                                { providerId: 'chatgpt-dom', modelId: 'dom', name: 'ChatGPT' },
                                { providerId: 'claude-dom', modelId: 'dom', name: 'Claude' }
                            ]
                        }
                    })
                ]
            })
        });

        expect(pushResponse.status).toBe(200);

        const pullResponse = await app.request('/api/sync/pull', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-sync-key': 'workspace-group'
            },
            body: JSON.stringify({ cursor: null })
        });

        expect(pullResponse.status).toBe(200);
        const pulled = await pullResponse.json() as {
            conversations: Array<{ modelSelection?: unknown }>;
        };
        expect(pulled.conversations[0].modelSelection).toEqual({
            providerId: 'group',
            modelId: 'dom',
            modelOptions: { web_search: true },
            reasoningEffort: 'high',
            explicit: true,
            groupMembers: [
                { providerId: 'chatgpt-dom', modelId: 'dom', name: 'ChatGPT' },
                { providerId: 'claude-dom', modelId: 'dom', name: 'Claude' }
            ]
        });
    });

    it('preserves message attachments and annotations across push and pull', async () => {
        const app = createApp({ config: createConfig({ isDevelopment: true }) });

        const pushResponse = await app.request('/api/sync/push', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-sync-key': 'workspace-rich'
            },
            body: JSON.stringify({
                conversations: [
                    createConversationPayload('conv-rich', 100, {
                        messages: [
                            {
                                id: 'conv-rich-m1',
                                role: 'user',
                                content: 'hello',
                                attachments: [
                                    {
                                        id: 'attachment-1',
                                        type: 'file',
                                        name: 'notes.txt',
                                        mimeType: 'text/plain',
                                        size: 42,
                                        base64Data: 'aGVsbG8='
                                    }
                                ]
                            },
                            {
                                id: 'conv-rich-m2',
                                role: 'assistant',
                                content: 'answer [1]',
                                annotations: [
                                    {
                                        kind: 'cite',
                                        range: { start: 7, end: 10 },
                                        payload: {
                                            refId: 'turn0search0',
                                            label: '[1]',
                                            title: 'Example',
                                            url: 'https://example.com/article',
                                            snippet: 'Example snippet'
                                        }
                                    }
                                ]
                            }
                        ]
                    })
                ]
            })
        });

        expect(pushResponse.status).toBe(200);

        const pullResponse = await app.request('/api/sync/pull', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-sync-key': 'workspace-rich'
            },
            body: JSON.stringify({ cursor: null })
        });

        expect(pullResponse.status).toBe(200);
        await expect(pullResponse.json()).resolves.toEqual({
            conversations: [
                {
                    id: 'conv-rich',
                    title: 'Conversation conv-rich',
                    updatedAt: 100,
                    messages: [
                        {
                            id: 'conv-rich-m1',
                            role: 'user',
                            content: 'hello',
                            attachments: [
                                {
                                    id: 'attachment-1',
                                    type: 'file',
                                    name: 'notes.txt',
                                    mimeType: 'text/plain',
                                    size: 42,
                                    base64Data: 'aGVsbG8='
                                }
                            ]
                        },
                        {
                            id: 'conv-rich-m2',
                            role: 'assistant',
                            content: 'answer [1]',
                            annotations: [
                                {
                                    kind: 'cite',
                                    range: { start: 7, end: 10 },
                                    payload: {
                                        refId: 'turn0search0',
                                        label: '[1]',
                                        title: 'Example',
                                        url: 'https://example.com/article',
                                        snippet: 'Example snippet'
                                    }
                                }
                            ]
                        }
                    ]
                }
            ],
            deletedConversations: [],
            nextCursor: 1
        });
    });

    it('supports task sync endpoints with incremental pull and independent cursors', async () => {
        const app = createApp({ config: createConfig({ isDevelopment: true }) });

        const pushResponse = await app.request('/api/sync/tasks/push', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-sync-key': 'workspace-task'
            },
            body: JSON.stringify({
                tasks: [
                    {
                        id: 'task-1',
                        title: 'Review sync design',
                        notes: '',
                        completed: false,
                        dueAt: null,
                        priority: 'medium',
                        executionState: null,
                        documentPath: '/docs/design.md',
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
                        recurrence: null,
                        unknownField: 'drop-me'
                    }
                ]
            })
        });

        expect(pushResponse.status).toBe(200);
        await expect(pushResponse.json()).resolves.toEqual({
            processedIds: ['task-1'],
            processedDeletedIds: [],
            nextCursor: 1
        });

        const pullResponse = await app.request('/api/sync/tasks/pull', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-sync-key': 'workspace-task'
            },
            body: JSON.stringify({ cursor: null })
        });

        expect(pullResponse.status).toBe(200);
        await expect(pullResponse.json()).resolves.toEqual({
            tasks: [
                {
                    id: 'task-1',
                    title: 'Review sync design',
                    notes: '',
                    completed: false,
                    dueAt: null,
                    priority: 'medium',
                    executionState: null,
                    documentPath: '/docs/design.md',
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
            ],
            deletedTasks: [],
            nextCursor: 1
        });

        const incrementalPull = await app.request('/api/sync/tasks/pull', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-sync-key': 'workspace-task'
            },
            body: JSON.stringify({ cursor: 1 })
        });

        expect(incrementalPull.status).toBe(200);
        await expect(incrementalPull.json()).resolves.toEqual({
            tasks: [],
            deletedTasks: [],
            nextCursor: 1
        });
    });

    it('syncs timed tasks through /api/sync/tasks/push when Google Calendar config is present', async () => {
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

        const app = createApp({ config: createConfig({ isDevelopment: true }) });

        const dueAt = new Date('2026-05-24T00:00:00').getTime();
        const pushResponse = await app.request('/api/sync/tasks/push', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-sync-key': 'workspace-calendar'
            },
            body: JSON.stringify({
                tasks: [
                    {
                        id: 'task-calendar-1',
                        title: 'Review sync design',
                        notes: 'Bring agenda',
                        completed: false,
                        dueAt,
                        priority: 'medium',
                        executionState: null,
                        documentPath: '/docs/design.md',
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
            })
        });

        expect(pushResponse.status).toBe(200);
        await expect(pushResponse.json()).resolves.toEqual({
            processedIds: ['task-calendar-1'],
            processedDeletedIds: [],
            nextCursor: 1
        });

        const pullResponse = await app.request('/api/sync/tasks/pull', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-sync-key': 'workspace-calendar'
            },
            body: JSON.stringify({ cursor: null })
        });

        expect(pullResponse.status).toBe(200);
        await expect(pullResponse.json()).resolves.toEqual({
            tasks: [
                expect.objectContaining({
                    id: 'task-calendar-1',
                    calendarProviderId: 'google-calendar',
                    calendarEventId: 'event-1',
                    calendarSyncStatus: 'synced',
                    calendarLastSyncedAt: expect.any(Number),
                    calendarLastSyncError: null
                })
            ],
            deletedTasks: [],
            nextCursor: 1
        });
        expect(fetchImpl).toHaveBeenCalledWith('https://oauth.example.test/token', expect.anything());
        expect(fetchImpl).toHaveBeenCalledWith('https://calendar.example.test/v3/calendars/primary/events', expect.anything());
    });

    it('preserves group member parts and summary across push and pull', async () => {
        const app = createApp({ config: createConfig({ isDevelopment: true }) });

        const pushResponse = await app.request('/api/sync/push', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-sync-key': 'workspace-group'
            },
            body: JSON.stringify({
                conversations: [
                    createConversationPayload('conv-group', 100, {
                        messages: [
                            {
                                id: 'conv-group-m1',
                                role: 'user',
                                content: 'compare these'
                            },
                            {
                                id: 'conv-group-m2',
                                role: 'assistant',
                                content: '### GPT\nfrom gpt\n\n### Gemini\nfrom gemini',
                                groupMembers: [
                                    {
                                        name: 'GPT',
                                        providerId: 'chatgpt-web',
                                        modelId: 'gpt-5',
                                        content: 'from gpt',
                                        status: 'done'
                                    },
                                    {
                                        name: 'Gemini',
                                        providerId: 'gemini-api',
                                        modelId: 'gemini-2.5-pro',
                                        content: 'from gemini',
                                        status: 'done'
                                    }
                                ],
                                groupSummary: {
                                    phase: 'done',
                                    content: '@GPT and @Gemini agree'
                                }
                            }
                        ]
                    })
                ]
            })
        });

        expect(pushResponse.status).toBe(200);

        const pullResponse = await app.request('/api/sync/pull', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-sync-key': 'workspace-group'
            },
            body: JSON.stringify({ cursor: null })
        });

        expect(pullResponse.status).toBe(200);
        const pulled = await pullResponse.json() as {
            conversations: Array<{ messages: Array<Record<string, unknown>> }>;
        };
        const assistantMessage = pulled.conversations[0].messages[1];
        expect(assistantMessage.groupMembers).toEqual([
            {
                name: 'GPT',
                providerId: 'chatgpt-web',
                modelId: 'gpt-5',
                content: 'from gpt',
                status: 'done'
            },
            {
                name: 'Gemini',
                providerId: 'gemini-api',
                modelId: 'gemini-2.5-pro',
                content: 'from gemini',
                status: 'done'
            }
        ]);
        expect(assistantMessage.groupSummary).toEqual({
            phase: 'done',
            content: '@GPT and @Gemini agree'
        });
    });

    it('accepts empty assistant placeholder messages during sync push', async () => {
        const app = createApp({ config: createConfig({ isDevelopment: true }) });

        const pushResponse = await app.request('/api/sync/push', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-sync-key': 'workspace-placeholder'
            },
            body: JSON.stringify({
                conversations: [
                    createConversationPayload('conv-placeholder', 100, {
                        messages: [
                            {
                                id: 'conv-placeholder-m1',
                                role: 'user',
                                content: 'hello'
                            },
                            {
                                id: 'conv-placeholder-m2',
                                role: 'assistant',
                                content: ''
                            }
                        ]
                    })
                ]
            })
        });

        expect(pushResponse.status).toBe(200);
        await expect(pushResponse.json()).resolves.toEqual({
            processedIds: ['conv-placeholder'],
            processedDeletedIds: [],
            nextCursor: 1
        });

        const pullResponse = await app.request('/api/sync/pull', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-sync-key': 'workspace-placeholder'
            },
            body: JSON.stringify({ cursor: null })
        });

        expect(pullResponse.status).toBe(200);
        await expect(pullResponse.json()).resolves.toEqual({
            conversations: [
                {
                    id: 'conv-placeholder',
                    title: 'Conversation conv-placeholder',
                    updatedAt: 100,
                    messages: [
                        {
                            id: 'conv-placeholder-m1',
                            role: 'user',
                            content: 'hello'
                        },
                        {
                            id: 'conv-placeholder-m2',
                            role: 'assistant',
                            content: ''
                        }
                    ]
                }
            ],
            deletedConversations: [],
            nextCursor: 1
        });
    });

    it('propagates dedicated deleted conversation events through push and pull', async () => {
        const app = createApp({ config: createConfig({ isDevelopment: true }) });

        const createResponse = await app.request('/api/sync/push', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-sync-key': 'workspace-delete'
            },
            body: JSON.stringify({
                conversations: [createConversationPayload('conv-delete', 100)]
            })
        });
        expect(createResponse.status).toBe(200);

        const deleteResponse = await app.request('/api/sync/push', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-sync-key': 'workspace-delete'
            },
            body: JSON.stringify({
                conversations: [],
                deletedConversations: [
                    {
                        id: 'conv-delete',
                        updatedAt: 110
                    }
                ]
            })
        });
        expect(deleteResponse.status).toBe(200);
        await expect(deleteResponse.json()).resolves.toEqual({
            processedIds: [],
            processedDeletedIds: ['conv-delete'],
            nextCursor: 2
        });

        const pullResponse = await app.request('/api/sync/pull', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-sync-key': 'workspace-delete'
            },
            body: JSON.stringify({ cursor: null })
        });

        expect(pullResponse.status).toBe(200);
        await expect(pullResponse.json()).resolves.toEqual({
            conversations: [],
            deletedConversations: [
                {
                    id: 'conv-delete',
                    updatedAt: 110
                }
            ],
            nextCursor: 2
        });
    });
});
