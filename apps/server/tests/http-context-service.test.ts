import { describe, expect, it, vi } from 'vitest';
import { HttpContextService } from '../src/services/httpContextService.js';
import type { ContextProvider } from '../src/types/context.js';

function createProvider(): ContextProvider {
    return {
        id: 'test-context',
        initializeAccess: vi.fn(async () => undefined),
        listTree: vi.fn(async () => [{ path: '/welcome.md', name: 'welcome.md', kind: 'file' }]),
        readDocument: vi.fn(async (path: string) => ({ path, content: '# hello' })),
        writeDocument: vi.fn(async () => undefined),
        createNode: vi.fn(async (input) => ({
            path: `${input.parentPath ?? ''}/${input.name}`.replace(/^$/, '/'),
            name: input.name,
            kind: input.kind,
            parentPath: input.parentPath
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
            content: '# hello'
        });
        await expect(service.writeDocument('/welcome.md', '# updated')).resolves.toBeUndefined();
        await expect(service.createNode({
            parentPath: '/notes',
            name: 'draft.md',
            kind: 'file'
        })).resolves.toMatchObject({
            name: 'draft.md',
            kind: 'file'
        });

        expect(provider.initializeAccess).toHaveBeenCalledTimes(1);
        expect(provider.listTree).toHaveBeenCalledWith('/notes');
        expect(provider.readDocument).toHaveBeenCalledWith('/welcome.md');
        expect(provider.writeDocument).toHaveBeenCalledWith('/welcome.md', '# updated');
        expect(provider.createNode).toHaveBeenCalledWith({
            parentPath: '/notes',
            name: 'draft.md',
            kind: 'file'
        });
    });
});

