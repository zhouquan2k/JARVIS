import { describe, expect, it, vi } from 'vitest';
import { HttpContextService } from '../src/services/httpContextService.js';
import type { ContextProvider } from '../src/types/context.js';
import { encodeTextDocument } from '@packages/core/src';

function createProvider(): ContextProvider {
    return {
        id: 'test-context',
        initializeAccess: vi.fn(async () => undefined),
        listTree: vi.fn(async () => [{ path: '/welcome.md', name: 'welcome.md', kind: 'file' }]),
        readDocument: vi.fn(async (path: string) => ({ path, mimeType: 'text/markdown', dataBase64: encodeTextDocument('# hello') })),
        writeDocument: vi.fn(async () => undefined),
        createNode: vi.fn(async (input) => ({
            path: `${input.parentPath ?? ''}/${input.name}`.replace(/^$/, '/'),
            name: input.name,
            kind: input.kind,
            parentPath: input.parentPath
        })),
        deleteNode: vi.fn(async () => undefined),
        renameNode: vi.fn(async (input) => ({
            path: input.path.replace(/[^/]+$/, input.name),
            name: input.name,
            kind: 'file'
        })),
        searchInScope: vi.fn(async () => [{ path: '/welcome.md', line: 1, column: 3, preview: '# hello' }]),
        resolveScopedAgentConfig: vi.fn(async (targetPath: string) => ({
            name: 'Default Knowledge Agent',
            scopePath: '/',
            sourcePaths: [],
            effectiveInstructions: 'Help with the workspace.'
        }))
    };
}

describe('http context service', () => {
    it('delegates context operations to the injected provider', async () => {
        const provider = createProvider();
        const service = new HttpContextService(provider);

        await service.initializeAccess();
        await expect(service.listTree('/notes')).resolves.toEqual([
            { path: '/welcome.md', name: 'welcome.md', kind: 'file' }
        ]);
        await expect(service.readDocument('/welcome.md')).resolves.toEqual({
            path: '/welcome.md',
            mimeType: 'text/markdown',
            dataBase64: encodeTextDocument('# hello')
        });
        await expect(service.writeDocument({
            path: '/welcome.md',
            mimeType: 'text/markdown',
            dataBase64: encodeTextDocument('# updated')
        })).resolves.toBeUndefined();
        await expect(service.createNode({
            parentPath: '/notes',
            name: 'draft.md',
            kind: 'file'
        })).resolves.toMatchObject({
            name: 'draft.md',
            kind: 'file'
        });
        await expect(service.deleteNode('/notes/draft.md')).resolves.toBeUndefined();
        await expect(service.renameNode({
            path: '/notes/draft.md',
            name: 'renamed.md'
        })).resolves.toMatchObject({
            path: '/notes/renamed.md',
            name: 'renamed.md'
        });
        await expect(service.searchInScope({
            query: 'hello',
            scopePath: '/',
            maxResults: 5
        })).resolves.toEqual([
            { path: '/welcome.md', line: 1, column: 3, preview: '# hello' }
        ]);
        await expect(service.resolveScopedAgentConfig('/notes/draft.md')).resolves.toMatchObject({
            name: 'Default Knowledge Agent',
            scopePath: '/'
        });

        expect(provider.initializeAccess).toHaveBeenCalledTimes(1);
        expect(provider.listTree).toHaveBeenCalledWith('/notes');
        expect(provider.readDocument).toHaveBeenCalledWith('/welcome.md');
        expect(provider.writeDocument).toHaveBeenCalledWith({
            path: '/welcome.md',
            mimeType: 'text/markdown',
            dataBase64: encodeTextDocument('# updated')
        });
        expect(provider.createNode).toHaveBeenCalledWith({
            parentPath: '/notes',
            name: 'draft.md',
            kind: 'file'
        });
        expect(provider.deleteNode).toHaveBeenCalledWith('/notes/draft.md');
        expect(provider.renameNode).toHaveBeenCalledWith({
            path: '/notes/draft.md',
            name: 'renamed.md'
        });
        expect(provider.searchInScope).toHaveBeenCalledWith({
            query: 'hello',
            scopePath: '/',
            maxResults: 5
        });
        expect(provider.resolveScopedAgentConfig).toHaveBeenCalledWith('/notes/draft.md');
    });
});
