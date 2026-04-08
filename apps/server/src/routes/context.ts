import { Hono, type Context } from 'hono';
import type { ConversationQuery } from '@packages/core';
import type { ServerConfig } from '../config.js';
import { HttpContextService } from '../services/httpContextService.js';
import type { ContextSearchRequest, CreateContextNodeInput, RenameContextNodeInput, WriteContextDocumentInput } from '../types/context.js';

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

async function readJsonBody(c: Context): Promise<unknown> {
    try {
        return await c.req.json();
    } catch {
        throw new Error('请求体必须是合法 JSON。');
    }
}

function normalizeObjectBody(body: unknown): Record<string, unknown> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new Error('请求体必须是对象。');
    }
    return body as Record<string, unknown>;
}

function normalizeOptionalPath(body: Record<string, unknown>): string | undefined {
    const value = body.parentPath;
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    if (typeof value !== 'string') {
        throw new Error('parentPath 必须是字符串。');
    }
    return value;
}

function normalizeRequiredPath(body: Record<string, unknown>): string {
    const value = body.path;
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error('path 不能为空。');
    }
    return value;
}

function normalizeConversationQuery(body: Record<string, unknown>): ConversationQuery {
    if (body.documentPath !== undefined && body.documentPath !== null && typeof body.documentPath !== 'string') {
        throw new Error('documentPath 必须是字符串。');
    }

    return {
        documentPath: typeof body.documentPath === 'string' ? body.documentPath : undefined
    };
}

function normalizeWriteDocumentInput(body: Record<string, unknown>): WriteContextDocumentInput {
    if (typeof body.mimeType !== 'string' || !body.mimeType.trim()) {
        throw new Error('mimeType 不能为空。');
    }

    if (typeof body.dataBase64 !== 'string') {
        throw new Error('dataBase64 必须是字符串。');
    }

    if (body.expectedVersion !== undefined && body.expectedVersion !== null && typeof body.expectedVersion !== 'string') {
        throw new Error('expectedVersion 必须是字符串。');
    }

    return {
        path: normalizeRequiredPath(body),
        mimeType: body.mimeType,
        dataBase64: body.dataBase64,
        expectedVersion: typeof body.expectedVersion === 'string' ? body.expectedVersion : undefined
    };
}

function normalizeCreateNodeInput(body: Record<string, unknown>): CreateContextNodeInput {
    if (typeof body.name !== 'string' || !body.name.trim()) {
        throw new Error('name 不能为空。');
    }
    if (body.kind !== 'file' && body.kind !== 'directory') {
        throw new Error('kind 必须是 file 或 directory。');
    }

    return {
        parentPath: normalizeOptionalPath(body),
        name: body.name,
        kind: body.kind
    };
}

function normalizeRenameNodeInput(body: Record<string, unknown>): RenameContextNodeInput {
    if (typeof body.name !== 'string' || !body.name.trim()) {
        throw new Error('name 不能为空。');
    }

    return {
        path: normalizeRequiredPath(body),
        name: body.name
    };
}

function normalizeSearchRequest(body: Record<string, unknown>): ContextSearchRequest {
    if (typeof body.query !== 'string' || !body.query.trim()) {
        throw new Error('query 不能为空。');
    }

    if (body.scopePath !== undefined && body.scopePath !== null && typeof body.scopePath !== 'string') {
        throw new Error('scopePath 必须是字符串。');
    }

    if (body.maxResults !== undefined && body.maxResults !== null) {
        if (typeof body.maxResults !== 'number' || !Number.isFinite(body.maxResults)) {
            throw new Error('maxResults 必须是数字。');
        }
    }

    return {
        query: body.query,
        scopePath: typeof body.scopePath === 'string' ? body.scopePath : undefined,
        maxResults: typeof body.maxResults === 'number' ? body.maxResults : undefined
    };
}

export function createContextRouter(options: { service: HttpContextService; config: ServerConfig }) {
    const app = new Hono();
    const { service, config } = options;

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

    app.post('/initialize-access', async (c) => {
        try {
            await service.initializeAccess();
            return c.json({ ok: true });
        } catch (error) {
            const message = error instanceof Error ? error.message : '初始化 context 访问失败。';
            return c.json({ error: message }, 400);
        }
    });

    app.post('/get-context', async (c) => {
        try {
            normalizeObjectBody(await readJsonBody(c));
            return c.json(await service.getContext());
        } catch (error) {
            const message = error instanceof Error ? error.message : '读取工作区上下文失败。';
            return c.json({ error: message }, 400);
        }
    });

    app.post('/get-conversations', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            return c.json({ conversations: await service.getConversations(normalizeConversationQuery(body)) });
        } catch (error) {
            const message = error instanceof Error ? error.message : '读取文档会话失败。';
            return c.json({ error: message }, 400);
        }
    });

    app.post('/read-document', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            return c.json({ document: await service.readDocument(normalizeRequiredPath(body)) });
        } catch (error) {
            const message = error instanceof Error ? error.message : '读取文档失败。';
            return c.json({ error: message }, 400);
        }
    });

    app.post('/write-document', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            await service.writeDocument(normalizeWriteDocumentInput(body));
            return c.json({ ok: true });
        } catch (error) {
            const message = error instanceof Error ? error.message : '写入文档失败。';
            return c.json({ error: message }, 400);
        }
    });

    app.post('/create-node', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            return c.json({ node: await service.createNode(normalizeCreateNodeInput(body)) });
        } catch (error) {
            const message = error instanceof Error ? error.message : '创建节点失败。';
            return c.json({ error: message }, 400);
        }
    });

    app.post('/delete-node', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            await service.deleteNode(normalizeRequiredPath(body));
            return c.json({ ok: true });
        } catch (error) {
            const message = error instanceof Error ? error.message : '删除节点失败。';
            return c.json({ error: message }, 400);
        }
    });

    app.post('/rename-node', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            return c.json({ node: await service.renameNode(normalizeRenameNodeInput(body)) });
        } catch (error) {
            const message = error instanceof Error ? error.message : '重命名节点失败。';
            return c.json({ error: message }, 400);
        }
    });

    app.post('/search-in-scope', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            return c.json({ matches: await service.searchInScope(normalizeSearchRequest(body)) });
        } catch (error) {
            const message = error instanceof Error ? error.message : '搜索作用域失败。';
            return c.json({ error: message }, 400);
        }
    });

    return app;
}
