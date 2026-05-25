import { Hono } from 'hono';
import type { AgentRunRequest, SendMessageOptions } from '@packages/core/src';
import type { ServerConfig } from '../config.js';
import type { CodexAuthService } from '../services/codexAuthService.js';
import type { CodexChatRequest, CodexCliService, CodexStreamEvent } from '../services/codexCliService.js';

export interface CreateCodexRouterOptions {
    authService: CodexAuthService;
    cliService: CodexCliService;
    config: ServerConfig;
}

type ChatRequestBody = {
    prompt?: unknown;
    options?: SendMessageOptions;
};

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

function applyCorsHeaders(response: Response, origin: string): Response {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Headers', ALLOW_HEADERS);
    response.headers.set('Access-Control-Allow-Methods', ALLOW_METHODS);
    response.headers.set('Vary', 'Origin');
    return response;
}

function buildSseResponse(start: (emit: (event: CodexStreamEvent) => void) => Promise<void>) {
    const encoder = new TextEncoder();

    return new Response(new ReadableStream({
        async start(controller) {
            const emit = (event: CodexStreamEvent) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            };

            try {
                await start(emit);
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            } catch (error) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    type: 'error',
                    error: error instanceof Error ? error.message : String(error)
                })}\n\n`));
            } finally {
                controller.close();
            }
        }
    }), {
        headers: {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache',
            connection: 'keep-alive'
        }
    });
}

function ensurePrompt(prompt: unknown): string {
    if (typeof prompt !== 'string' || !prompt.trim()) {
        throw new Error('Prompt must not be empty.');
    }

    return prompt;
}

export function createCodexRouter(options: CreateCodexRouterOptions) {
    const app = new Hono();
    const { config } = options;

    app.use('*', async (c, next) => {
        const origin = c.req.header('origin');
        const corsOrigin = resolveCorsOrigin(origin, config);

        if (origin && !corsOrigin) {
            return c.json({ error: 'Origin not allowed.' }, 403);
        }

        if (c.req.method === 'OPTIONS') {
            const response = c.body(null, 204);
            if (corsOrigin) {
                return applyCorsHeaders(response, corsOrigin);
            }
            return response;
        }

        await next();

        if (corsOrigin) {
            applyCorsHeaders(c.res, corsOrigin);
        }
    });

    app.get('/auth/status', async (c) => {
        return c.json(await options.authService.getAuthStatus());
    });

    app.post('/auth/login', async (c) => {
        return c.json(await options.authService.startLogin());
    });

    app.get('/models', async (c) => {
        return c.json(await options.cliService.getModelCatalog());
    });

    app.post('/chat', async (c) => {
        const body = await c.req.json<ChatRequestBody>();
        const request: CodexChatRequest = {
            prompt: ensurePrompt(body.prompt),
            options: body.options
        };

        return buildSseResponse(async (emit) => {
            const result = await options.cliService.runChat(request, emit);
            emit(result);
        });
    });

    app.post('/agent', async (c) => {
        const request = await c.req.json<AgentRunRequest>();
        request.prompt = ensurePrompt(request.prompt);

        return buildSseResponse(async (emit) => {
            const result = await options.cliService.runAgent(request, emit);
            emit(result);
        });
    });

    return app;
}
