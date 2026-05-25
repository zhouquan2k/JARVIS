import { describe, expect, it, vi } from 'vitest';
import { createCodexRouter } from '../src/routes/codex.js';

describe('codex route', () => {
    it('returns auth status and model catalog from normalized services', async () => {
        const app = createCodexRouter({
            authService: {
                getAuthStatus: vi.fn().mockResolvedValue({
                    authenticated: true,
                    providerId: 'chatgpt-codex'
                }),
                startLogin: vi.fn()
            } as any,
            cliService: {
                getModelCatalog: vi.fn().mockResolvedValue({
                    models: [{ id: 'gpt-5.4', name: 'GPT-5.4' }],
                    defaultModel: 'gpt-5.4'
                })
            } as any,
            config: {
                port: 8787,
                dbPath: ':memory:',
                isDevelopment: true,
                corsAllowlist: [],
                contextBackend: 'local-file',
                codexCommand: 'codex',
                codexWorkingDirectory: process.cwd()
            }
        });

        const authResponse = await app.request('/auth/status');
        expect(authResponse.status).toBe(200);
        await expect(authResponse.json()).resolves.toEqual({
            authenticated: true,
            providerId: 'chatgpt-codex'
        });

        const modelsResponse = await app.request('/models');
        expect(modelsResponse.status).toBe(200);
        await expect(modelsResponse.json()).resolves.toEqual({
            models: [{ id: 'gpt-5.4', name: 'GPT-5.4' }],
            defaultModel: 'gpt-5.4'
        });
    });

    it('streams normalized chat events and validates empty prompts', async () => {
        const cliService = {
            getModelCatalog: vi.fn(),
            runChat: vi.fn(async (_request, onEvent) => {
                onEvent({ type: 'message.delta', delta: 'Hello' });
                return {
                    type: 'message.completed',
                    text: 'Hello',
                    conversationId: 'conv-1',
                    messageId: 'msg-1'
                };
            }),
            runAgent: vi.fn()
        };

        const app = createCodexRouter({
            authService: {
                getAuthStatus: vi.fn(),
                startLogin: vi.fn()
            } as any,
            cliService: cliService as any,
            config: {
                port: 8787,
                dbPath: ':memory:',
                isDevelopment: true,
                corsAllowlist: [],
                contextBackend: 'local-file',
                codexCommand: 'codex',
                codexWorkingDirectory: process.cwd()
            }
        });

        const invalidResponse = await app.request('/chat', {
            method: 'POST',
            body: JSON.stringify({ prompt: '' }),
            headers: { 'content-type': 'application/json' }
        });
        expect(invalidResponse.status).toBe(500);

        const response = await app.request('/chat', {
            method: 'POST',
            body: JSON.stringify({ prompt: 'hi' }),
            headers: { 'content-type': 'application/json' }
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('text/event-stream');
        const body = await response.text();
        expect(body).toContain('"type":"message.delta"');
        expect(body).toContain('"type":"message.completed"');
    });

    it('responds to CORS preflight for auth login', async () => {
        const app = createCodexRouter({
            authService: {
                getAuthStatus: vi.fn(),
                startLogin: vi.fn()
            } as any,
            cliService: {
                getModelCatalog: vi.fn()
            } as any,
            config: {
                port: 8787,
                dbPath: ':memory:',
                isDevelopment: true,
                corsAllowlist: [],
                contextBackend: 'local-file',
                codexCommand: 'codex',
                codexWorkingDirectory: process.cwd()
            }
        });

        const response = await app.request('/auth/login', {
            method: 'OPTIONS',
            headers: {
                Origin: 'http://localhost:5173'
            }
        });

        expect(response.status).toBe(204);
        expect(response.headers.get('access-control-allow-origin')).toBe('*');
        expect(response.headers.get('access-control-allow-methods')).toBe('GET, POST, OPTIONS');
        expect(response.headers.get('access-control-allow-headers')).toBe('content-type');
    });
});
