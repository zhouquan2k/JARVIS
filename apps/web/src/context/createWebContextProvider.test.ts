import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWebContextProvider, resolveContextBaseUrl } from './createWebContextProvider';
import { createApp } from '../../../server/src/app';

const tempRoots: string[] = [];

describe('createWebContextProvider', () => {
  afterEach(async () => {
    await Promise.all(tempRoots.map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }));
    tempRoots.length = 0;
  });

  it('derives the context base url from the explicit env or sync base url', () => {
    expect(resolveContextBaseUrl({
      VITE_CONTEXT_BASE_URL: 'https://context.example.com/api/context/'
    })).toBe('https://context.example.com/api/context');

    expect(resolveContextBaseUrl({
      VITE_SYNC_BASE_URL: 'https://sync.example.com/api/sync/'
    })).toBe('https://sync.example.com/api/context');
  });

  it('talks to /api/context endpoints with IContextProvider semantics', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};

      if (url.endsWith('/initialize-access')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.endsWith('/list-tree')) {
        expect(body).toEqual({ parentPath: '/notes' });
        return new Response(JSON.stringify({
          nodes: [{ path: '/notes/today.md', name: 'today.md', kind: 'file', parentPath: '/notes' }]
        }), { status: 200 });
      }
      if (url.endsWith('/read-document')) {
        expect(body).toEqual({ path: '/notes/today.md' });
        return new Response(JSON.stringify({
          document: { path: '/notes/today.md', content: '# Today' }
        }), { status: 200 });
      }
      if (url.endsWith('/write-document')) {
        expect(body).toEqual({ path: '/notes/today.md', content: '# Updated' });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.endsWith('/create-node')) {
        expect(body).toEqual({ parentPath: '/notes', name: 'draft.md', kind: 'file' });
        return new Response(JSON.stringify({
          node: { path: '/notes/draft.md', name: 'draft.md', kind: 'file', parentPath: '/notes' }
        }), { status: 200 });
      }
      if (url.endsWith('/search-in-scope')) {
        expect(body).toEqual({ query: 'Today', scopePath: '/notes', maxResults: 3 });
        return new Response(JSON.stringify({
          matches: [{ path: '/notes/today.md', line: 1, column: 3, preview: '# Today' }]
        }), { status: 200 });
      }
      if (url.endsWith('/resolve-scoped-agent-config')) {
        expect(body).toEqual({ path: '/notes/today.md' });
        return new Response(JSON.stringify({
          agent: {
            name: 'Notes Agent',
            scopePath: '/notes',
            sourcePaths: ['/notes/.agent.json'],
            effectiveInstructions: 'Focus on notes.',
            modelProviderName: 'gemini-api',
            modelName: 'gemini-2.5-flash'
          }
        }), { status: 200 });
      }

      return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
    });

    const provider = createWebContextProvider({
      baseUrl: 'https://context.example.com/api/context/',
      fetchImpl
    });

    await expect(provider.initializeAccess()).resolves.toBeUndefined();
    await expect(provider.listTree('/notes')).resolves.toEqual([
      { path: '/notes/today.md', name: 'today.md', kind: 'file', parentPath: '/notes' }
    ]);
    await expect(provider.readDocument('/notes/today.md')).resolves.toEqual({
      path: '/notes/today.md',
      content: '# Today'
    });
    await expect(provider.writeDocument('/notes/today.md', '# Updated')).resolves.toBeUndefined();
    await expect(provider.createNode({
      parentPath: '/notes',
      name: 'draft.md',
      kind: 'file'
    })).resolves.toEqual({
      path: '/notes/draft.md',
      name: 'draft.md',
      kind: 'file',
      parentPath: '/notes'
    });
    await expect(provider.searchInScope({
      query: 'Today',
      scopePath: '/notes',
      maxResults: 3
    })).resolves.toEqual([
      { path: '/notes/today.md', line: 1, column: 3, preview: '# Today' }
    ]);
    await expect(provider.resolveScopedAgentConfig('/notes/today.md')).resolves.toEqual({
      name: 'Notes Agent',
      scopePath: '/notes',
      sourcePaths: ['/notes/.agent.json'],
      effectiveInstructions: 'Focus on notes.',
      modelProviderName: 'gemini-api',
      modelName: 'gemini-2.5-flash'
    });

    expect(fetchImpl).toHaveBeenCalledTimes(7);
  });

  it('surfaces server-side context errors', async () => {
    const provider = createWebContextProvider({
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({
        error: 'CHATPRISM_KNOWLEDGE_ROOT 未配置。'
      }), { status: 400 }))
    });

    await expect(provider.initializeAccess()).rejects.toThrow('CHATPRISM_KNOWLEDGE_ROOT 未配置。');
  });

  it('integrates the web adapter with the server /api/context route', async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-web-context-'));
    tempRoots.push(rootPath);
    await mkdir(path.join(rootPath, 'notes'));
    await writeFile(path.join(rootPath, 'welcome.md'), '# Welcome\n');
    await writeFile(path.join(rootPath, 'notes', 'today.md'), '# Today\n');

    const serverApp = createApp({
      config: {
        port: 8787,
        dbPath: ':memory:',
        isDevelopment: true,
        corsAllowlist: [],
        knowledgeRoot: rootPath,
        contextBackend: 'local-file'
      }
    });

    const provider = createWebContextProvider({
      baseUrl: 'http://context.test/api/context',
      fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        return serverApp.request(url.pathname, init);
      }
    });

    await expect(provider.initializeAccess()).resolves.toBeUndefined();
    await expect(provider.listTree()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '/notes', kind: 'directory' }),
      expect.objectContaining({ path: '/welcome.md', kind: 'file' })
    ]));
    await expect(provider.readDocument('/welcome.md')).resolves.toMatchObject({
      path: '/welcome.md',
      content: '# Welcome\n'
    });
    await expect(provider.writeDocument('/welcome.md', '# Updated\n')).resolves.toBeUndefined();
    await expect(provider.createNode({
      parentPath: '/notes',
      name: 'draft.md',
      kind: 'file'
    })).resolves.toMatchObject({
      path: '/notes/draft.md',
      kind: 'file'
    });
    await expect(provider.searchInScope({
      query: 'Today',
      scopePath: '/notes'
    })).resolves.toEqual([
      expect.objectContaining({ path: '/notes/today.md', line: 1, column: 3 })
    ]);
    await expect(provider.resolveScopedAgentConfig('/notes/today.md')).resolves.toMatchObject({
      scopePath: '/',
      name: 'Default Knowledge Agent'
    });
  });

  it('returns root scope for the default agent through the real server context route', async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-web-context-default-root-'));
    tempRoots.push(rootPath);
    await mkdir(path.join(rootPath, 'My-Life'));
    await writeFile(path.join(rootPath, 'My-Life', 'today.md'), '# Today\n');

    const serverApp = createApp({
      config: {
        port: 8787,
        dbPath: ':memory:',
        isDevelopment: true,
        corsAllowlist: [],
        knowledgeRoot: rootPath,
        contextBackend: 'local-file'
      }
    });

    const provider = createWebContextProvider({
      baseUrl: 'http://context.test/api/context',
      fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        return serverApp.request(url.pathname, init);
      }
    });

    await expect(provider.initializeAccess()).resolves.toBeUndefined();
    await expect(provider.resolveScopedAgentConfig('/My-Life/today.md')).resolves.toMatchObject({
      name: 'Default Knowledge Agent',
      scopePath: '/',
      sourcePaths: []
    });
  });
});
