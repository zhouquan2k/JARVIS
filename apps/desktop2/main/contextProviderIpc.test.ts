import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { IContextProvider } from '@packages/core/src';
import {
    DESKTOP_CONTEXT_BRIDGE_METHODS,
    DESKTOP_CONTEXT_CHANNELS
} from '../shared/contextBridge';

vi.mock('electron', () => ({
    ipcMain: {
        handle: vi.fn(),
        removeHandler: vi.fn()
    }
}));

import {
    createDesktopMainContextProvider,
    registerContextProviderIpc
} from './contextProviderIpc';

function createIpcMock() {
    return {
        handle: vi.fn(),
        removeHandler: vi.fn()
    };
}

function getHandler(ipc: ReturnType<typeof createIpcMock>, channel: string) {
    const matched = ipc.handle.mock.calls.find(([registeredChannel]) => registeredChannel === channel);
    return matched?.[1] as ((...args: any[]) => unknown) | undefined;
}

function createProviderMock(): IContextProvider {
    return {
        id: 'mock-context',
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
        resolveDocumentIds: vi.fn(async () => new Map([['doc-guide', null]]))
    };
}

describe('contextProviderIpc', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('registers one ipc channel for every IContextProvider bridge method', () => {
        const ipc = createIpcMock();

        registerContextProviderIpc({
            ipc,
            provider: createProviderMock()
        });

        expect(ipc.handle.mock.calls.map(([channel]) => channel)).toEqual(
            DESKTOP_CONTEXT_BRIDGE_METHODS.map((method) => DESKTOP_CONTEXT_CHANNELS[method])
        );
    });

    it('bridges getFolderMetadata and resolveDocumentIds through ipc-safe payloads', async () => {
        const ipc = createIpcMock();
        const provider = createProviderMock();
        (provider.getFolderMetadata as ReturnType<typeof vi.fn>).mockResolvedValue({
            scopeKey: '/',
            data: { name: 'Root Agent' }
        });
        (provider.resolveDocumentIds as ReturnType<typeof vi.fn>).mockResolvedValue(new Map([
            ['doc-guide', {
                path: '/guide.md',
                name: 'guide.md',
                kind: 'file',
                scopeKey: '/'
            }]
        ]));

        registerContextProviderIpc({ ipc, provider });

        const getFolderMetadataHandler = getHandler(ipc, DESKTOP_CONTEXT_CHANNELS.getFolderMetadata);
        const resolveDocumentIdsHandler = getHandler(ipc, DESKTOP_CONTEXT_CHANNELS.resolveDocumentIds);

        await expect(getFolderMetadataHandler?.({}, '/guide.md')).resolves.toEqual({
            scopeKey: '/',
            data: { name: 'Root Agent' }
        });
        await expect(resolveDocumentIdsHandler?.({}, ['doc-guide'])).resolves.toEqual({
            'doc-guide': {
                path: '/guide.md',
                name: 'guide.md',
                kind: 'file',
                scopeKey: '/'
            }
        });
    });

    it('creates a filesystem-backed provider that reads local files without any HTTP base url', async () => {
        const rootPath = await mkdtemp(path.join(tmpdir(), 'desktop-context-ipc-'));

        try {
            await writeFile(path.join(rootPath, 'guide.md'), '# Offline Guide\n', 'utf8');
            const provider = createDesktopMainContextProvider(rootPath);

            await provider.initializeAccess();
            const document = await provider.readDocument('/guide.md');
            const decoded = Buffer.from(document.dataBase64, 'base64').toString('utf8');

            expect(decoded).toBe('# Offline Guide\n');

            await provider.writeDocument({
                path: '/guide.md',
                mimeType: 'text/markdown',
                dataBase64: Buffer.from('# Updated Guide\n').toString('base64')
            });

            await expect(readFile(path.join(rootPath, 'guide.md'), 'utf8')).resolves.toBe('# Updated Guide\n');
        } finally {
            await rm(rootPath, { recursive: true, force: true });
        }
    });
});
