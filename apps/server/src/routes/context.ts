import { Hono, type Context } from 'hono';
import type { ConversationQuery } from '@packages/core';
import type { ServerConfig } from '../config.js';
import { HttpContextService } from '../services/httpContextService.js';
import type { ContextSearchRequest, CreateContextNodeInput, RenameContextNodeInput, WriteContextDocumentInput } from '../types/context.js';

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
        throw new Error('Request body must be valid JSON.');
    }
}

function normalizeObjectBody(body: unknown): Record<string, unknown> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new Error('Request body must be an object.');
    }
    return body as Record<string, unknown>;
}

function normalizeOptionalPath(body: Record<string, unknown>): string | undefined {
    const value = body.parentPath;
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    if (typeof value !== 'string') {
        throw new Error('parentPath must be a string.');
    }
    return value;
}

function normalizeRequiredPath(body: Record<string, unknown>): string {
    const value = body.path;
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error('path must not be empty.');
    }
    return value;
}

function normalizeConversationQuery(body: Record<string, unknown>): ConversationQuery {
    if (body.documentPath !== undefined && body.documentPath !== null && typeof body.documentPath !== 'string') {
        throw new Error('documentPath must be a string.');
    }

    return {
        documentPath: typeof body.documentPath === 'string' ? body.documentPath : undefined
    };
}

function normalizeCurNode(body: Record<string, unknown>): string {
    const value = body.curNode;
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error('curNode must not be empty.');
    }
    return value;
}

function normalizeWriteDocumentInput(body: Record<string, unknown>): WriteContextDocumentInput {
    if (typeof body.mimeType !== 'string' || !body.mimeType.trim()) {
        throw new Error('mimeType must not be empty.');
    }

    if (typeof body.dataBase64 !== 'string') {
        throw new Error('dataBase64 must be a string.');
    }

    if (body.expectedVersion !== undefined && body.expectedVersion !== null && typeof body.expectedVersion !== 'string') {
        throw new Error('expectedVersion must be a string.');
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
        throw new Error('name must not be empty.');
    }
    if (body.kind !== 'file' && body.kind !== 'directory') {
        throw new Error('kind must be file or directory.');
    }

    return {
        parentPath: normalizeOptionalPath(body),
        name: body.name,
        kind: body.kind
    };
}

function normalizeRenameNodeInput(body: Record<string, unknown>): RenameContextNodeInput {
    if (typeof body.name !== 'string' || !body.name.trim()) {
        throw new Error('name must not be empty.');
    }

    return {
        path: normalizeRequiredPath(body),
        name: body.name
    };
}

function normalizeSearchRequest(body: Record<string, unknown>): ContextSearchRequest {
    if (typeof body.query !== 'string' || !body.query.trim()) {
        throw new Error('query must not be empty.');
    }

    if (body.scopePath !== undefined && body.scopePath !== null && typeof body.scopePath !== 'string') {
        throw new Error('scopePath must be a string.');
    }

    if (body.maxResults !== undefined && body.maxResults !== null) {
        if (typeof body.maxResults !== 'number' || !Number.isFinite(body.maxResults)) {
            throw new Error('maxResults must be a number.');
        }
    }

    return {
        query: body.query,
        scopePath: typeof body.scopePath === 'string' ? body.scopePath : undefined,
        maxResults: typeof body.maxResults === 'number' ? body.maxResults : undefined
    };
}

function setRequestError(c: Context, message: string): void {
    c.set('requestError', { message });
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
            const message = error instanceof Error ? error.message : 'Failed to initialize context access.';
            return c.json({ error: message, code: 'CONTEXT_INITIALIZE_FAILED' }, 400);
        }
    });

    app.post('/get-context', async (c) => {
        try {
            normalizeObjectBody(await readJsonBody(c));
            return c.json(await service.getContext());
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to read workspace context.';
            return c.json({ error: message, code: 'CONTEXT_GET_FAILED' }, 400);
        }
    });

    app.post('/get-conversations', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            return c.json({ conversations: await service.getConversations(normalizeConversationQuery(body)) });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to read document conversations.';
            return c.json({ error: message, code: 'CONTEXT_GET_CONVERSATIONS_FAILED' }, 400);
        }
    });

    app.post('/get-project-documents', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            return c.json({ documents: await service.getProjectDocuments(normalizeCurNode(body)) });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to read project documents.';
            return c.json({ error: message, code: 'CONTEXT_GET_PROJECT_DOCUMENTS_FAILED' }, 400);
        }
    });

    app.post('/read-document', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            return c.json({ document: await service.readDocument(normalizeRequiredPath(body)) });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to read document.';
            return c.json({ error: message, code: 'CONTEXT_READ_DOCUMENT_FAILED' }, 400);
        }
    });

    app.get('/document-asset', async (c) => {
        try {
            const path = c.req.query('path');
            if (typeof path !== 'string' || !path.trim()) {
                throw new Error('path must not be empty.');
            }

            const document = await service.readDocument(path);

            c.header('Content-Type', document.mimeType);
            c.header('Cache-Control', 'no-store');
            return c.body(Buffer.from(document.dataBase64, 'base64'));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to read document asset.';
            return c.json({ error: message, code: 'CONTEXT_READ_DOCUMENT_ASSET_FAILED' }, 400);
        }
    });

    app.post('/write-document', async (c) => {
        let body: Record<string, unknown> | null = null;
        try {
            body = normalizeObjectBody(await readJsonBody(c));
            const result = await service.writeDocument(normalizeWriteDocumentInput(body));
            return c.json({ ok: true, result });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to write document.';
            setRequestError(c, message);
            console.error('[sync-server] write-document failed', {
                path: typeof body?.path === 'string' ? body.path : undefined,
                mimeType: typeof body?.mimeType === 'string' ? body.mimeType : undefined,
                expectedVersion: typeof body?.expectedVersion === 'string' ? body.expectedVersion : undefined,
                dataBase64Length: typeof body?.dataBase64 === 'string' ? body.dataBase64.length : undefined,
                error: message
            });
            return c.json({ error: message, code: 'CONTEXT_WRITE_DOCUMENT_FAILED' }, 400);
        }
    });

    app.post('/create-node', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            return c.json({ node: await service.createNode(normalizeCreateNodeInput(body)) });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to create node.';
            return c.json({ error: message, code: 'CONTEXT_CREATE_NODE_FAILED' }, 400);
        }
    });

    app.post('/delete-node', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            await service.deleteNode(normalizeRequiredPath(body));
            return c.json({ ok: true });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to delete node.';
            return c.json({ error: message, code: 'CONTEXT_DELETE_NODE_FAILED' }, 400);
        }
    });

    app.post('/rename-node', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            return c.json({ node: await service.renameNode(normalizeRenameNodeInput(body)) });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to rename node.';
            return c.json({ error: message, code: 'CONTEXT_RENAME_NODE_FAILED' }, 400);
        }
    });

    app.post('/search-in-scope', async (c) => {
        try {
            const body = normalizeObjectBody(await readJsonBody(c));
            return c.json({ matches: await service.searchInScope(normalizeSearchRequest(body)) });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to search scope.';
            return c.json({ error: message, code: 'CONTEXT_SEARCH_SCOPE_FAILED' }, 400);
        }
    });

    return app;
}
