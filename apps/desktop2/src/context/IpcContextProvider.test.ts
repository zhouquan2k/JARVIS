// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('IpcContextProvider', () => {
    beforeEach(() => {
        window.jarvisContext = {
            initializeAccess: vi.fn(async () => undefined),
            getContext: vi.fn(async () => ({ nodes: [], folderMetadata: {} })),
            getFolderMetadata: vi.fn(async () => null),
            getProjectDocuments: vi.fn(async () => []),
            readDocument: vi.fn(async () => ({
                path: '/guide.md',
                mimeType: 'text/markdown',
                dataBase64: Buffer.from('# Guide').toString('base64')
            })),
            writeDocument: vi.fn(async () => ({})),
            createNode: vi.fn(async () => ({
                path: '/guide.md',
                name: 'guide.md',
                kind: 'file',
                scopeKey: '/'
            })),
            deleteNode: vi.fn(async () => undefined),
            renameNode: vi.fn(async () => ({
                path: '/guide.md',
                name: 'guide.md',
                kind: 'file',
                scopeKey: '/'
            })),
            moveNode: vi.fn(async () => ({
                path: '/guide.md',
                name: 'guide.md',
                kind: 'file',
                scopeKey: '/'
            })),
            searchInScope: vi.fn(async () => []),
            getDocumentId: vi.fn(async () => 'doc-guide'),
            resolveDocumentIds: vi.fn(async () => ({
                'doc-guide': {
                    path: '/guide.md',
                    name: 'guide.md',
                    kind: 'file',
                    scopeKey: '/'
                }
            }))
        };
    });

    it('delegates context methods to the preload bridge', async () => {
        const { IpcContextProvider } = await import('./IpcContextProvider');
        const provider = new IpcContextProvider();

        await expect(provider.getDocumentId('/guide.md')).resolves.toBe('doc-guide');
        await expect(provider.resolveDocumentIds(['doc-guide'])).resolves.toEqual(new Map([
            ['doc-guide', {
                path: '/guide.md',
                name: 'guide.md',
                kind: 'file',
                scopeKey: '/'
            }]
        ]));
    });
});
