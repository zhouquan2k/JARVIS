import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
        codexCommand: 'codex',
        codexWorkingDirectory: process.cwd(),
        ...overrides
    };
}

async function waitForCondition(assertion: () => Promise<void>, attempts = 20): Promise<void> {
    let lastError: unknown;
    for (let index = 0; index < attempts; index += 1) {
        try {
            await assertion();
            return;
        } catch (error) {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, 10));
        }
    }

    throw lastError;
}

describe('app migration startup', () => {
    const tempRoots: string[] = [];

    afterEach(async () => {
        await Promise.all(tempRoots.map(async (root) => {
            await rm(root, { recursive: true, force: true });
        }));
        tempRoots.length = 0;
    });

    it('treats missing migrateNeeded as true and writes false after startup migration', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-server-migration-'));
        tempRoots.push(rootPath);
        await mkdir(path.join(rootPath, '.chatprism'), { recursive: true });
        await writeFile(path.join(rootPath, '.jarvis-meta.json'), JSON.stringify({ jarvis_schema: 1 }, null, 2) + '\n', 'utf8');

        const provider = {
            initializeAccess: vi.fn(async () => undefined),
            getDocumentId: vi.fn(async () => 'doc-1')
        } as unknown as ContextProvider;

        createApp({
            config: createConfig({ knowledgeRoot: rootPath }),
            contextProvider: provider
        });

        await waitForCondition(async () => {
            expect(provider.initializeAccess).toHaveBeenCalledTimes(1);
            const meta = JSON.parse(await readFile(path.join(rootPath, '.jarvis-meta.json'), 'utf8')) as Record<string, unknown>;
            expect(meta.migrateNeeded).toBe(false);
        });
    });

    it('skips startup migration when migrateNeeded is already false', async () => {
        const rootPath = await mkdtemp(path.join(os.tmpdir(), 'chatprism-server-migration-'));
        tempRoots.push(rootPath);
        await mkdir(path.join(rootPath, '.chatprism'), { recursive: true });
        await writeFile(path.join(rootPath, '.jarvis-meta.json'), JSON.stringify({ migrateNeeded: false }, null, 2) + '\n', 'utf8');

        const provider = {
            initializeAccess: vi.fn(async () => undefined),
            getDocumentId: vi.fn(async () => 'doc-1')
        } as unknown as ContextProvider;

        createApp({
            config: createConfig({ knowledgeRoot: rootPath }),
            contextProvider: provider
        });

        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(provider.initializeAccess).not.toHaveBeenCalled();
    });
});
