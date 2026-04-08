import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

async function allocatePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
                server.close();
                reject(new Error('无法分配测试端口。'));
                return;
            }

            const { port } = address;
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(port);
            });
        });
        server.on('error', reject);
    });
}

describe('server startup smoke', () => {
    const tempDirs: string[] = [];

    afterEach(async () => {
        await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    });

    it('starts the real server entry with tsx and listens successfully', async () => {
        const rootDir = await mkdtemp(path.join(os.tmpdir(), 'chatprism-server-smoke-'));
        tempDirs.push(rootDir);
        await mkdir(path.join(rootDir, 'docs'));
        await writeFile(path.join(rootDir, 'docs', 'guide.md'), '# Smoke\n');

        const dbPath = path.join(rootDir, 'sync.sqlite');
        const port = await allocatePort();

        await new Promise<void>((resolve, reject) => {
            const child = spawn(
                process.execPath,
                ['--import', 'tsx', 'src/index.ts'],
                {
                    cwd: path.resolve(import.meta.dirname, '..'),
                    env: {
                        ...process.env,
                        PORT: String(port),
                        CHATPRISM_SYNC_DB_PATH: dbPath,
                        CHATPRISM_KNOWLEDGE_ROOT: rootDir
                    },
                    stdio: ['ignore', 'pipe', 'pipe']
                }
            );

            let stdout = '';
            let stderr = '';
            let settled = false;

            const cleanup = () => {
                child.stdout.removeAllListeners();
                child.stderr.removeAllListeners();
                child.removeAllListeners();
            };

            const timer = setTimeout(() => {
                if (settled) {
                    return;
                }
                settled = true;
                child.kill('SIGTERM');
                cleanup();
                reject(new Error(`server 启动超时。\nstdout:\n${stdout}\nstderr:\n${stderr}`));
            }, 15_000);

            child.stdout.on('data', (chunk) => {
                stdout += String(chunk);
                if (stdout.includes(`ChatPrism sync server listening on http://localhost:${port}`)) {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    clearTimeout(timer);
                    child.kill('SIGTERM');
                    cleanup();
                    resolve();
                }
            });

            child.stderr.on('data', (chunk) => {
                stderr += String(chunk);
            });

            child.on('exit', (code, signal) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                cleanup();
                reject(new Error(`server 提前退出。code=${code} signal=${signal}\nstdout:\n${stdout}\nstderr:\n${stderr}`));
            });

            child.on('error', (error) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                cleanup();
                reject(error);
            });
        });

        expect(true).toBe(true);
    });
});
