import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { ServerConfig } from '../src/config.js';

function createConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
    return {
        port: 8787,
        dbPath: ':memory:',
        isDevelopment: false,
        corsAllowlist: ['https://chatprism.test'],
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
            nextCursor: 1
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
            nextCursor: 1
        });
    });
});
