import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeBase64, encodeTextDocument } from '@packages/core/src';
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

        const listRoot = await app.request('/api/context/get-context', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}'
        });
        expect(listRoot.status).toBe(200);
        await expect(listRoot.json()).resolves.toMatchObject({
            nodes: expect.arrayContaining([
                expect.objectContaining({ path: '/notes', kind: 'directory' }),
                expect.objectContaining({ path: '/welcome.md', kind: 'file' })
            ]),
            agentConfigs: expect.any(Object)
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
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Welcome\n')
            })
        });

        const writeDocumentResponse = await app.request('/api/context/write-document', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                path: '/welcome.md',
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('# Updated\n')
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

        const deleteNodeResponse = await app.request('/api/context/delete-node', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: '/notes/draft.md' })
        });
        expect(deleteNodeResponse.status).toBe(200);
        await expect(deleteNodeResponse.json()).resolves.toEqual({ ok: true });

        const renameNodeResponse = await app.request('/api/context/rename-node', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: '/welcome.md', name: 'welcome-renamed.md' })
        });
        expect(renameNodeResponse.status).toBe(200);
        await expect(renameNodeResponse.json()).resolves.toMatchObject({
            node: expect.objectContaining({
                path: '/welcome-renamed.md',
                name: 'welcome-renamed.md',
                kind: 'file'
            })
        });

        const refreshedContextResponse = await app.request('/api/context/get-context', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}'
        });
        expect(refreshedContextResponse.status).toBe(200);

        const listDocumentConversationsResponse = await app.request('/api/context/get-conversations', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ documentPath: '/welcome-renamed.md' })
        });
        expect(listDocumentConversationsResponse.status).toBe(200);
        await expect(listDocumentConversationsResponse.json()).resolves.toEqual({ conversations: [] });
    });

    it('reads pdf documents through /api/context/read-document with binary payload and read-only metadata', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-context-'));
        tempRoots.push(rootPath);
        const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
        await writeFile(path.join(rootPath, 'guide.pdf'), pdfBytes);

        const app = createApp({
            config: createConfig({
                isDevelopment: true,
                knowledgeRoot: rootPath
            })
        });

        const readDocumentResponse = await app.request('/api/context/read-document', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: '/guide.pdf' })
        });

        expect(readDocumentResponse.status).toBe(200);
        await expect(readDocumentResponse.json()).resolves.toMatchObject({
            document: {
                path: '/guide.pdf',
                mimeType: 'application/pdf',
                dataBase64: encodeBase64(pdfBytes),
                canWrite: false
            }
        });
    });

    it('serves image documents through /api/context/document-asset', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-context-'));
        tempRoots.push(rootPath);
        const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
        const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
        await mkdir(path.join(rootPath, 'images'));
        await writeFile(path.join(rootPath, 'images', 'flow.png'), imageBytes);
        await writeFile(path.join(rootPath, 'welcome.md'), '# Welcome\n');
        await writeFile(path.join(rootPath, 'guide.pdf'), pdfBytes);

        const app = createApp({
            config: createConfig({
                isDevelopment: true,
                knowledgeRoot: rootPath
            })
        });

        const imageResponse = await app.request('/api/context/document-asset?path=%2Fimages%2Fflow.png', {
            method: 'GET'
        });
        expect(imageResponse.status).toBe(200);
        expect(imageResponse.headers.get('content-type')).toContain('image/png');
        expect(new Uint8Array(await imageResponse.arrayBuffer())).toEqual(imageBytes);

        const markdownResponse = await app.request('/api/context/document-asset?path=%2Fwelcome.md', {
            method: 'GET'
        });
        expect(markdownResponse.status).toBe(200);
        expect(markdownResponse.headers.get('content-type')).toContain('text/markdown');
        expect(await markdownResponse.text()).toBe('# Welcome\n');

        const pdfResponse = await app.request('/api/context/document-asset?path=%2Fguide.pdf', {
            method: 'GET'
        });
        expect(pdfResponse.status).toBe(200);
        expect(pdfResponse.headers.get('content-type')).toContain('application/pdf');
        expect(new Uint8Array(await pdfResponse.arrayBuffer())).toEqual(pdfBytes);
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
            error: 'Path escapes the knowledge workspace root: /../secret.md'
        });
    });

    it('keeps the route swappable through an injected context provider', async () => {
        const provider: ContextProvider = {
            id: 'fake-context',
            initializeAccess: vi.fn(async () => undefined),
            getContext: vi.fn(async () => ({
                nodes: [{ path: '/virtual.md', name: 'virtual.md', kind: 'file', agentKey: '/' }],
                agentConfigs: {}
            })),
            getConversations: vi.fn(async (query: { documentPath?: string }) => [{
                id: 'conversation-1',
                title: 'Virtual conversation',
                origin: 'local',
                documentPaths: query.documentPath ? [query.documentPath] : undefined,
                messages: [],
                updatedAt: 100
            }]),
            readDocument: vi.fn(async (filePath: string) => ({
                path: filePath,
                mimeType: 'text/markdown',
                dataBase64: encodeTextDocument('virtual'),
                canWrite: true
            })),
            writeDocument: vi.fn(async () => undefined),
            createNode: vi.fn(async (input) => ({
                path: `/${input.name}`,
                name: input.name,
                kind: input.kind,
                agentKey: '/'
            })),
            deleteNode: vi.fn(async () => undefined),
            renameNode: vi.fn(async (input) => ({
                path: `/${input.name}`,
                name: input.name,
                kind: 'file',
                agentKey: '/'
            })),
            searchInScope: vi.fn(async () => [])
        };

        const app = createApp({
            config: createConfig({ isDevelopment: true }),
            contextProvider: provider
        });

        const response = await app.request('/api/context/get-context', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}'
        });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            nodes: [{ path: '/virtual.md', name: 'virtual.md', kind: 'file', agentKey: '/' }],
            agentConfigs: {}
        });
        expect(provider.getContext).toHaveBeenCalledTimes(1);

        const listDocumentConversationsResponse = await app.request('/api/context/get-conversations', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ documentPath: '/virtual.md' })
        });

        expect(listDocumentConversationsResponse.status).toBe(200);
        await expect(listDocumentConversationsResponse.json()).resolves.toEqual({
            conversations: [
                expect.objectContaining({
                    id: 'conversation-1',
                    documentPaths: ['/virtual.md']
                })
            ]
        });
        expect(provider.getConversations).toHaveBeenCalledWith({ documentPath: '/virtual.md' });
    });
});
