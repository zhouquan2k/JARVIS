import { Hono, type Context } from 'hono';
import type { ServerConfig } from '../config.js';

type TranscriptService = {
    fetch(url: string, options?: { signal?: AbortSignal }): Promise<{ title: string; transcript: string }>;
};

const ALLOW_HEADERS = 'content-type';
const ALLOW_METHODS = 'POST, OPTIONS';

function resolveCorsOrigin(origin: string | undefined, config: ServerConfig): string | null {
    if (!origin) {
        return null;
    }

    if (config.isDevelopment) {
        return '*';
    }

    return config.corsAllowlist.includes(origin) ? origin : null;
}

function applyCorsHeaders(c: Context, origin: string): void {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Headers', ALLOW_HEADERS);
    c.header('Access-Control-Allow-Methods', ALLOW_METHODS);
    c.header('Vary', 'Origin');
}

function normalizeUrl(body: unknown): string {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new Error('Request body must be an object.');
    }

    const url = (body as Record<string, unknown>).url;
    if (typeof url !== 'string' || !url.trim()) {
        throw new Error('url must not be empty.');
    }

    return url.trim();
}

export function createImportRouter(options: {
    bilibiliTranscriptService: TranscriptService;
    config: ServerConfig;
}) {
    const app = new Hono();

    app.use('*', async (c, next) => {
        const origin = c.req.header('origin');
        const corsOrigin = resolveCorsOrigin(origin, options.config);

        if (origin && !corsOrigin) {
            return c.json({ error: 'Origin not allowed.' }, 403);
        }

        if (c.req.method === 'OPTIONS') {
            if (corsOrigin) {
                applyCorsHeaders(c, corsOrigin);
            }
            return c.body(null, 204);
        }

        await next();

        if (corsOrigin) {
            applyCorsHeaders(c, corsOrigin);
        }
    });

    app.post('/bilibili', async (c) => {
        try {
            const body = await c.req.json();
            const result = await options.bilibiliTranscriptService.fetch(normalizeUrl(body), {
                signal: c.req.raw.signal
            });
            return c.json(result);
        } catch (error) {
            return c.json({
                error: error instanceof Error ? error.message : String(error)
            }, 400);
        }
    });

    return app;
}
