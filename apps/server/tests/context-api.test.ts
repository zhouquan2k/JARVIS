import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import type { ServerConfig } from '../src/config.js';
import type { ContextProvider } from '../src/types/context.js';

function createConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
    return {
        port: 8787,
        dbPath: ':memory:',
        isDevelopment: false,
        corsAllowlist: ['https://chatprism.test'],
        knowledgeRoot: undefined,
        contextBackend: 'local-file',
        ...overrides
    };
}

describe('context api', () => {
    const tempRoots: string[] = [];

    afterEach(async () => {
        await Promise.all(tempRoots.map(async (root) => {
            await import('node:fs/promises').then(({ rm }) => rm(root, { recursive: true, force: true }));
        }));
        tempRoots.length = 0;
    });

    it('supports initialize list read write and create semantics through /api/context', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-context-'));
        tempRoots.push(rootPath);
        await mkdir(path.join(rootPath, 'notes'));
        await writeFile(path.join(rootPath, 'welcome.md'), '# Welcome\n');
        await writeFile(path.join(rootPath, 'notes', 'today.md'), '# Today\n');

        const app = createApp({
            config: createConfig({
                isDevelopment: true,
                knowledgeRoot: rootPath
            })
        });

        const initialized = await app.request('/api/context/initialize-access', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}'
        });
        expect(initialized.status).toBe(200);
        await expect(initialized.json()).resolves.toEqual({ ok: true });

        const listRoot = await app.request('/api/context/list-tree', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}'
        });
        expect(listRoot.status).toBe(200);
        await expect(listRoot.json()).resolves.toMatchObject({
            nodes: expect.arrayContaining([
                expect.objectContaining({ path: '/notes', kind: 'directory' }),
                expect.objectContaining({ path: '/welcome.md', kind: 'file' })
            ])
        });

        const readDocumentResponse = await app.request('/api/context/read-document', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: '/welcome.md' })
        });
        expect(readDocumentResponse.status).toBe(200);
        await expect(readDocumentResponse.json()).resolves.toMatchObject({
            document: expect.objectContaining({
                path: '/welcome.md',
                content: '# Welcome\n'
            })
        });

        const writeDocumentResponse = await app.request('/api/context/write-document', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                path: '/welcome.md',
                content: '# Updated\n'
            })
        });
        expect(writeDocumentResponse.status).toBe(200);
        await expect(writeDocumentResponse.json()).resolves.toEqual({ ok: true });
        await expect(readFile(path.join(rootPath, 'welcome.md'), 'utf8')).resolves.toBe('# Updated\n');

        const createNodeResponse = await app.request('/api/context/create-node', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                parentPath: '/notes',
                name: 'draft.md',
                kind: 'file'
            })
        });
        expect(createNodeResponse.status).toBe(200);
        await expect(createNodeResponse.json()).resolves.toMatchObject({
            node: expect.objectContaining({
                path: '/notes/draft.md',
                kind: 'file'
            })
        });
        await expect(readFile(path.join(rootPath, 'notes', 'draft.md'), 'utf8')).resolves.toBe('');
    });

    it('rejects out-of-root traversal and supports context route cors', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-context-'));
        tempRoots.push(rootPath);
        await writeFile(path.join(rootPath, 'welcome.md'), '# Welcome\n');

        const app = createApp({
            config: createConfig({
                knowledgeRoot: rootPath
            })
        });

        const preflight = await app.request('/api/context/read-document', {
            method: 'OPTIONS',
            headers: {
                Origin: 'https://chatprism.test',
                'Access-Control-Request-Method': 'POST'
            }
        });
        expect(preflight.status).toBe(204);
        expect(preflight.headers.get('access-control-allow-origin')).toBe('https://chatprism.test');

        const rejected = await app.request('/api/context/read-document', {
            method: 'POST',
            headers: {
                Origin: 'https://chatprism.test',
                'content-type': 'application/json'
            },
            body: JSON.stringify({ path: '/../secret.md' })
        });
        expect(rejected.status).toBe(400);
        await expect(rejected.json()).resolves.toEqual({
            error: '路径超出知识工作区根目录: /../secret.md'
        });
    });

    it('keeps the route swappable through an injected context provider', async () => {
        const provider: ContextProvider = {
            id: 'fake-context',
            initializeAccess: vi.fn(async () => undefined),
            listTree: vi.fn(async () => [{ path: '/virtual.md', name: 'virtual.md', kind: 'file' }]),
            readDocument: vi.fn(async (filePath: string) => ({ path: filePath, content: 'virtual' })),
            writeDocument: vi.fn(async () => undefined),
            createNode: vi.fn(async (input) => ({
                path: `/${input.name}`,
                name: input.name,
                kind: input.kind
            }))
        };

        const app = createApp({
            config: createConfig({ isDevelopment: true }),
            contextProvider: provider
        });

        const response = await app.request('/api/context/list-tree', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}'
        });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            nodes: [{ path: '/virtual.md', name: 'virtual.md', kind: 'file' }]
        });
        expect(provider.listTree).toHaveBeenCalledWith(undefined);
    });
});

