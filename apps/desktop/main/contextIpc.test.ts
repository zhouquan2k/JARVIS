import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    DESKTOP_CONTEXT_CREATE_NODE_CHANNEL,
    DESKTOP_CONTEXT_INITIALIZE_CHANNEL,
    DESKTOP_CONTEXT_LIST_TREE_CHANNEL,
    DESKTOP_CONTEXT_READ_DOCUMENT_CHANNEL,
    DESKTOP_CONTEXT_SEARCH_IN_SCOPE_CHANNEL,
    DESKTOP_CONTEXT_RESOLVE_AGENT_CHANNEL,
    DESKTOP_CONTEXT_WRITE_DOCUMENT_CHANNEL
} from '../shared/contextBridge';
import { registerContextIpc, resolveDesktopWorkspaceRoot } from './contextIpc';

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

describe('contextIpc', () => {
    const tempDirs: string[] = [];

    afterEach(async () => {
        await Promise.all(tempDirs.map((target) => rm(target, { recursive: true, force: true })));
        tempDirs.length = 0;
    });

    it('rejects missing CHATPRISM_KNOWLEDGE_ROOT', async () => {
        await expect(resolveDesktopWorkspaceRoot('')).rejects.toThrow(
            'Desktop knowledge workspace root is not configured. Set CHATPRISM_KNOWLEDGE_ROOT.'
        );
    });

    it('rejects invalid workspace roots', async () => {
        const baseDir = await mkdtemp(join(tmpdir(), 'chatprism-context-invalid-'));
        tempDirs.push(baseDir);
        const filePath = join(baseDir, 'not-a-directory.md');
        await writeFile(filePath, '# not a directory\n', 'utf8');

        await expect(resolveDesktopWorkspaceRoot(join(baseDir, 'missing'))).rejects.toThrow('does not exist');
        await expect(resolveDesktopWorkspaceRoot(filePath)).rejects.toThrow('must be a directory');
    });

    it('reads and writes documents inside CHATPRISM_KNOWLEDGE_ROOT', async () => {
        const workspaceRoot = await mkdtemp(join(tmpdir(), 'chatprism-context-valid-'));
        tempDirs.push(workspaceRoot);
        await mkdir(join(workspaceRoot, 'notes'), { recursive: true });
        await writeFile(join(workspaceRoot, 'notes', 'today.md'), '# Today\n\n- hi\n', 'utf8');

        const ipc = createIpcMock();
        const dispose = registerContextIpc({ ipc, workspaceRoot });
        const initializeHandler = getHandler(ipc, DESKTOP_CONTEXT_INITIALIZE_CHANNEL);
        const listTreeHandler = getHandler(ipc, DESKTOP_CONTEXT_LIST_TREE_CHANNEL);
        const readDocumentHandler = getHandler(ipc, DESKTOP_CONTEXT_READ_DOCUMENT_CHANNEL);
        const searchInScopeHandler = getHandler(ipc, DESKTOP_CONTEXT_SEARCH_IN_SCOPE_CHANNEL);
        const resolveAgentHandler = getHandler(ipc, DESKTOP_CONTEXT_RESOLVE_AGENT_CHANNEL);
        const writeDocumentHandler = getHandler(ipc, DESKTOP_CONTEXT_WRITE_DOCUMENT_CHANNEL);

        await initializeHandler?.({});

        const nodes = await listTreeHandler?.({}, undefined) as Array<{ path: string; kind: string }>;
        expect(nodes).toEqual([
            expect.objectContaining({ path: '/notes', kind: 'directory' })
        ]);

        const document = await readDocumentHandler?.({}, '/notes/today.md') as { content: string };
        expect(document.content).toContain('# Today');

        const matches = await searchInScopeHandler?.({}, {
            query: 'Today',
            scopePath: '/notes'
        }) as Array<{ path: string; line: number; column: number }>;
        expect(matches).toEqual([
            expect.objectContaining({ path: '/notes/today.md', line: 1, column: 3 })
        ]);

        const resolvedAgent = await resolveAgentHandler?.({}, '/notes/today.md') as { scopePath: string; name: string };
        expect(resolvedAgent).toMatchObject({
            scopePath: '/',
            name: 'Default Knowledge Agent'
        });

        await writeDocumentHandler?.({}, '/notes/today.md', '# Updated\n');
        const updatedDocument = await readDocumentHandler?.({}, '/notes/today.md') as { content: string };
        expect(updatedDocument.content).toBe('# Updated\n');

        dispose();
        expect(ipc.removeHandler).toHaveBeenCalledWith(DESKTOP_CONTEXT_INITIALIZE_CHANNEL);
        expect(ipc.removeHandler).toHaveBeenCalledWith(DESKTOP_CONTEXT_LIST_TREE_CHANNEL);
        expect(ipc.removeHandler).toHaveBeenCalledWith(DESKTOP_CONTEXT_READ_DOCUMENT_CHANNEL);
        expect(ipc.removeHandler).toHaveBeenCalledWith(DESKTOP_CONTEXT_SEARCH_IN_SCOPE_CHANNEL);
        expect(ipc.removeHandler).toHaveBeenCalledWith(DESKTOP_CONTEXT_RESOLVE_AGENT_CHANNEL);
        expect(ipc.removeHandler).toHaveBeenCalledWith(DESKTOP_CONTEXT_WRITE_DOCUMENT_CHANNEL);
        expect(ipc.removeHandler).toHaveBeenCalledWith(DESKTOP_CONTEXT_CREATE_NODE_CHANNEL);
    });

    it('rejects node creation attempts that escape the workspace root', async () => {
        const workspaceRoot = await mkdtemp(join(tmpdir(), 'chatprism-context-boundary-'));
        tempDirs.push(workspaceRoot);

        const ipc = createIpcMock();
        registerContextIpc({ ipc, workspaceRoot });
        const createNodeHandler = getHandler(ipc, DESKTOP_CONTEXT_CREATE_NODE_CHANNEL);

        await expect(
            createNodeHandler?.({}, { parentPath: undefined, name: '../escape.md', kind: 'file' })
        ).rejects.toThrow('Knowledge workspace node name is invalid');
    });
});
