import { Hono, type Context } from 'hono';
import type { ServerConfig } from '../config.js';
import {
    normalizePullRequest,
    normalizePushRequest,
    normalizeTaskPullRequest,
    normalizeTaskPushRequest
} from '../types/sync.js';
import { SyncService } from '../services/syncService.js';

const ALLOW_HEADERS = 'content-type, x-sync-key';
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

function resolveSyncKey(value: string | undefined, config: ServerConfig): string {
    const normalized = value?.trim();
    if (!normalized) {
        throw new Error('syncKey must not be empty.');
    }

    if (normalized === '0' && !config.isDevelopment) {
        throw new Error('syncKey=0 is only allowed in development; configure a real syncKey first.');
    }

    return normalized;
}

async function readJsonBody(c: Context): Promise<unknown> {
    try {
        return await c.req.json();
    } catch {
        throw new Error('Request body must be valid JSON.');
    }
}

export function createSyncRouter(options: {
    service: SyncService;
    config: ServerConfig;
    ensureTaskSyncMigrated?: (syncKey: string) => Promise<void>;
}) {
    const app = new Hono();
    const { service, config, ensureTaskSyncMigrated } = options;

    app.use('*', async (c, next) => {
        const origin = c.req.header('origin');
        const corsOrigin = resolveCorsOrigin(origin, config);

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

    app.post('/push', async (c) => {
        try {
            const syncKey = resolveSyncKey(c.req.header('x-sync-key'), config);
            const body = normalizePushRequest(await readJsonBody(c));
            return c.json(service.push(syncKey, body.conversations, body.deletedConversations ?? []));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Invalid push request.';
            const code = /syncKey/i.test(message) ? 'SYNC_KEY_INVALID' : 'SYNC_PUSH_INVALID';
            return c.json({ error: message, code }, 400);
        }
    });

    app.post('/pull', async (c) => {
        try {
            const syncKey = resolveSyncKey(c.req.header('x-sync-key'), config);
            const body = normalizePullRequest(await readJsonBody(c));
            return c.json(service.pull(syncKey, body.cursor));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Invalid pull request.';
            const code = /syncKey/i.test(message) ? 'SYNC_KEY_INVALID' : 'SYNC_PULL_INVALID';
            return c.json({ error: message, code }, 400);
        }
    });

    app.post('/tasks/push', async (c) => {
        try {
            const syncKey = resolveSyncKey(c.req.header('x-sync-key'), config);
            await ensureTaskSyncMigrated?.(syncKey);
            const body = normalizeTaskPushRequest(await readJsonBody(c));
            return c.json(await service.pushTasks(syncKey, body.tasks, body.deletedTasks ?? []));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Invalid task push request.';
            const code = /syncKey/i.test(message) ? 'SYNC_KEY_INVALID' : 'SYNC_TASK_PUSH_INVALID';
            return c.json({ error: message, code }, 400);
        }
    });

    app.post('/tasks/pull', async (c) => {
        try {
            const syncKey = resolveSyncKey(c.req.header('x-sync-key'), config);
            await ensureTaskSyncMigrated?.(syncKey);
            const body = normalizeTaskPullRequest(await readJsonBody(c));
            return c.json(service.pullTasks(syncKey, body.cursor));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Invalid task pull request.';
            const code = /syncKey/i.test(message) ? 'SYNC_KEY_INVALID' : 'SYNC_TASK_PULL_INVALID';
            return c.json({ error: message, code }, 400);
        }
    });

    return app;
}
