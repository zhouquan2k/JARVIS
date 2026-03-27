import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createMockContextProvider } from '@packages/core/src';
import { useKnowledgeWorkspaceStore } from './knowledgeWorkspace';

describe('useKnowledgeWorkspaceStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('hydrates the tree and opens the first file', async () => {
        const store = useKnowledgeWorkspaceStore();
        store.setContextProvider(createMockContextProvider({
            nodes: [
                { path: '/notes', name: 'notes', kind: 'directory' },
                { path: '/notes/day-1.md', name: 'day-1.md', kind: 'file', parentPath: '/notes' }
            ],
            documents: {
                '/notes/day-1.md': '# Day 1'
            }
        }));

        await store.hydrateWorkspace();

        expect(store.nodes).toHaveLength(2);
        expect(store.activePath).toBe('/notes/day-1.md');
        expect(store.draftContent).toBe('# Day 1');
        expect(store.expandedPaths).toEqual([]);
    });

    it('flushes the previous file before switching documents', async () => {
        const provider = createMockContextProvider({
            nodes: [
                { path: '/alpha.md', name: 'alpha.md', kind: 'file' },
                { path: '/beta.md', name: 'beta.md', kind: 'file' }
            ],
            documents: {
                '/alpha.md': 'alpha',
                '/beta.md': 'beta'
            }
        });
        const store = useKnowledgeWorkspaceStore();
        store.setContextProvider(provider);

        await store.hydrateWorkspace();
        store.updateActiveDocument('alpha updated');
        await store.openNode('/beta.md');

        const alpha = await provider.readDocument('/alpha.md');
        expect(alpha.content).toBe('alpha updated');
        expect(store.activePath).toBe('/beta.md');
        expect(store.draftContent).toBe('beta');
    });

    it('creates files and opens them immediately', async () => {
        const store = useKnowledgeWorkspaceStore();
        store.setContextProvider(createMockContextProvider());

        await store.hydrateWorkspace();
        await store.createNode({
            name: 'new-note.md',
            kind: 'file'
        });

        expect(store.nodes.some((node) => node.path === '/new-note.md')).toBe(true);
        expect(store.activePath).toBe('/new-note.md');
    });

    it('filters dot-prefixed files and directories from the visible tree', async () => {
        const store = useKnowledgeWorkspaceStore();
        store.setContextProvider(createMockContextProvider({
            nodes: [
                { path: '/.git', name: '.git', kind: 'directory' },
                { path: '/.git/config', name: 'config', kind: 'file', parentPath: '/.git' },
                { path: '/.env', name: '.env', kind: 'file' },
                { path: '/visible', name: 'visible', kind: 'directory' },
                { path: '/visible/note.md', name: 'note.md', kind: 'file', parentPath: '/visible' }
            ],
            documents: {
                '/visible/note.md': '# Visible'
            }
        }));

        await store.hydrateWorkspace();

        expect(store.nodes.map((node) => node.path)).toEqual([
            '/visible',
            '/visible/note.md'
        ]);
        expect(store.activePath).toBe('/visible/note.md');
    });
});
