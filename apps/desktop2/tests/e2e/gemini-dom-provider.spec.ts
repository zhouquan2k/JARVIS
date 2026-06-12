/**
 * e2e: DOM automation provider (gemini-dom)
 *
 * Uses a local mock page that mirrors Gemini's DOM selectors.
 * Validates the full chain: preload injection → MutationObserver →
 * page→main→renderer IPC → DomAutomationProvider → UI assistant message.
 *
 * AGENTS.md: desktop e2e must use channel:'chromium'; requires elevated sandbox.
 */
import { expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appRoot = join(__dirname, '../..');
const electronBinary = join(appRoot, 'node_modules/.bin/electron');
const desktopEntry = join(appRoot, 'dist/main/main/index.js');
const mockGeminiHtml = join(__dirname, 'fixtures/mock-gemini.html');

// ── helpers ────────────────────────────────────────────────────────────────

import { chromium } from '@playwright/test';

async function waitForCdpEndpoint(port: number, stderrLog: string[]): Promise<string> {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
        const joined = stderrLog.join('');
        const m = joined.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (m?.[1]) return m[1];
        await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`Timed out waiting for Electron CDP on port ${port}\n${stderrLog.join('')}`);
}

async function waitForFirstPage(browser: Awaited<ReturnType<typeof chromium.connectOverCDP>>) {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
        for (const ctx of browser.contexts()) {
            for (const pg of ctx.pages()) {
                const url = pg.url();
                if (url && !url.startsWith('devtools://') && url !== 'about:blank') return pg;
            }
        }
        await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('Timed out waiting for Electron renderer page');
}

function kill(p: ChildProcess) {
    if (!p.killed) p.kill('SIGTERM');
}

async function findControlledPage(
    browser: Awaited<ReturnType<typeof chromium.connectOverCDP>>,
    urlPrefix: string
) {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        for (const ctx of browser.contexts()) {
            for (const pg of ctx.pages()) {
                if (pg.url().startsWith(urlPrefix)) return pg;
            }
        }
        await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`Timed out waiting for controlled page with prefix ${urlPrefix}`);
}

async function startContextServer(knowledgeRoot: string): Promise<{
    process: ChildProcess;
    contextBaseUrl: string;
    syncBaseUrl: string;
}> {
    const port = 8800 + Math.floor(Math.random() * 200);
    const proc = spawn('pnpm', ['--filter', 'server', 'dev'], {
        cwd: appRoot,
        env: {
            ...process.env,
            PORT: String(port),
            CHATPRISM_KNOWLEDGE_ROOT: knowledgeRoot,
            CHATPRISM_RENDERER_DIST: join(appRoot, 'dist/renderer')
        },
        stdio: 'pipe'
    });
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        try {
            const r = await fetch(`http://127.0.0.1:${port}/health`);
            if (r.ok) break;
        } catch { /* not ready yet */ }
        await new Promise((r) => setTimeout(r, 250));
    }
    return {
        process: proc,
        contextBaseUrl: `http://127.0.0.1:${port}/api/context`,
        syncBaseUrl: `http://127.0.0.1:${port}/api/sync`
    };
}

async function startMockGeminiServer(): Promise<{ server: Server; url: string }> {
    const html = await readFile(mockGeminiHtml, 'utf8');
    const server = createServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('Failed to start mock Gemini server');
    return { server, url: `http://127.0.0.1:${addr.port}` };
}

async function launchDesktopApp(options: {
    contextBaseUrl: string;
    syncBaseUrl: string;
    domGeminiUrl: string;
}) {
    const port = 9700 + Math.floor(Math.random() * 200);
    const stderrLog: string[] = [];
    const stdoutLog: string[] = [];
    const proc = spawn(
        electronBinary,
        [desktopEntry, `--remote-debugging-port=${port}`],
        {
            env: {
                ...process.env,
                VITE_E2E: '1',
                CHATPRISM_SYNC_KEY: 'gemini-dom-e2e',
                CHATPRISM_CONTEXT_BASE_URL: options.contextBaseUrl,
                CHATPRISM_SYNC_BASE_URL: options.syncBaseUrl,
                CHATPRISM_KNOWLEDGE_ROOT: appRoot,
                CHATPRISM_DOM_GEMINI_URL: options.domGeminiUrl,
                ELECTRON_RUN_AS_NODE: undefined
            } as Record<string, string | undefined>,
            stdio: 'pipe'
        }
    );
    proc.stderr?.on('data', (c) => stderrLog.push(String(c)));
    proc.stdout?.on('data', (c) => stdoutLog.push(String(c)));

    try {
        const cdp = await waitForCdpEndpoint(port, stderrLog);
        const browser = await chromium.connectOverCDP(cdp);
        const page = await waitForFirstPage(browser);
        return { browser, page, electronProcess: proc, stdoutLog };
    } catch (err) {
        kill(proc);
        throw err;
    }
}

async function openGeminiDomConversation(page: Awaited<ReturnType<typeof waitForFirstPage>>) {
    await expect(page.getByTestId('topbar-workspace-normal-chat')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('topbar-workspace-normal-chat').click();
    await expect(page.getByTestId('conversation-workspace')).toBeVisible();
    await expect(page.getByTestId('normal-provider')).toBeVisible();

    // New conversations adopt the agent default provider by design; a manual
    // provider choice only outranks the default AFTER the conversation exists.
    // So create the conversation first, then drive the user-level (explicit)
    // selection so it survives the subsequent send.
    const switchResult = await page.evaluate(async (providerId) => {
        const pinia = (window as unknown as { __pinia?: { _s: Map<string, unknown> } }).__pinia;
        if (!pinia) return 'no __pinia';
        const store = pinia._s.get('chat') as
            | {
                setCurrentModelProviderByUser(id: string): Promise<void>;
                startNewConversation(): Promise<void>;
                currentProviderId: string;
                currentConversation: unknown;
            }
            | undefined;
        if (!store) return 'no chat store';
        if (!store.currentConversation) {
            await store.startNewConversation();
        }
        await store.setCurrentModelProviderByUser(providerId);
        return 'switched:' + store.currentProviderId;
    }, 'gemini-dom');
    if (!switchResult.startsWith('switched:gemini-dom')) {
        throw new Error(`Failed to switch provider via store: ${switchResult}`);
    }

    await expect(page.getByTestId('normal-input')).toBeEnabled({ timeout: 15_000 });
}

// ── tests ──────────────────────────────────────────────────────────────────

test('gemini-dom provider appears in desktop provider selector', async () => {
    const desktopServer = await startContextServer(appRoot);
    const { browser, page, electronProcess } = await launchDesktopApp({
        contextBaseUrl: desktopServer.contextBaseUrl,
        syncBaseUrl: desktopServer.syncBaseUrl,
        domGeminiUrl: 'http://127.0.0.1:1'
    });

    try {
        await expect(page.getByTestId('topbar-workspace-normal-chat')).toBeVisible({ timeout: 15_000 });
        await page.getByTestId('topbar-workspace-normal-chat').click();
        await expect(page.getByTestId('conversation-workspace')).toBeVisible();

        const options = page.getByTestId('normal-provider').locator('option');
        await expect(options).toContainText(['Gemini (DOM)']);

        await browser.close();
    } finally {
        kill(electronProcess);
        kill(desktopServer.process);
    }
});

test('gemini-dom provider streams reply via mock page and shows assistant message', async () => {
    const desktopServer = await startContextServer(appRoot);
    const mockServer = await startMockGeminiServer();
    const { browser, page, electronProcess, stdoutLog } = await launchDesktopApp({
        contextBaseUrl: desktopServer.contextBaseUrl,
        syncBaseUrl: desktopServer.syncBaseUrl,
        domGeminiUrl: mockServer.url
    });

    const rendererLogs: string[] = [];
    page.on('console', (msg) => {
        const text = msg.text();
        if (text.includes('[Dom') || text.includes('[Gemini') || text.includes('[Controlled')) {
            rendererLogs.push(text);
        }
    });

    try {
        await openGeminiDomConversation(page);

        const inputArea = page.getByTestId('normal-input');
        await inputArea.fill('Hello from gemini e2e test');
        await page.getByTestId('normal-send').click();

        const assistantMsg = page.getByTestId('normal-messages').locator('.message.assistant').last();
        await expect(assistantMsg).toContainText(
            'Hello! I am a mock Gemini response',
            { timeout: 30_000 }
        ).catch(async (err: unknown) => {
            const storeState = await page.evaluate(() => {
                const el = document.querySelector('[data-testid="normal-error"]');
                return {
                    currentError: el?.textContent?.trim() ?? null,
                    providerSelect: (document.querySelector('[data-testid="normal-provider"]') as HTMLSelectElement)?.value ?? null
                };
            }).catch(() => ({ currentError: 'eval-failed', providerSelect: null }));
            console.error('[test-diagnostic] store state:', JSON.stringify(storeState));
            console.error('[test-diagnostic] renderer logs (' + rendererLogs.length + '):\n', rendererLogs.join('\n') || '(none)');
            const mainLogs = stdoutLog.join('').split('\n').filter((l) => l.includes('[Controlled')).join('\n');
            console.error('[test-diagnostic] main IPC logs:\n', mainLogs || '(none)');
            throw err;
        });

        await browser.close();
    } finally {
        kill(electronProcess);
        kill(desktopServer.process);
        mockServer.server.close();
    }
});

test('gemini-dom reasoning selector updates Gemini thinking level without changing the current model', async () => {
    const desktopServer = await startContextServer(appRoot);
    const mockServer = await startMockGeminiServer();
    const { browser, page, electronProcess } = await launchDesktopApp({
        contextBaseUrl: desktopServer.contextBaseUrl,
        syncBaseUrl: desktopServer.syncBaseUrl,
        domGeminiUrl: mockServer.url
    });

    try {
        await openGeminiDomConversation(page);
        const controlled = await findControlledPage(browser, mockServer.url);
        const initialModeLabel = (await controlled.getByTestId('mock-gemini-mode-label').textContent())?.trim() ?? '';

        await expect.poll(
            () => controlled.getByTestId('mock-gemini-thinking-level').textContent(),
            { timeout: 15_000 }
        ).toContain('扩展');
        await expect(controlled.getByTestId('mock-gemini-mode-label')).toContainText(initialModeLabel);

        await page.getByTestId('reasoning-effort').selectOption('low');
        await expect.poll(
            () => controlled.getByTestId('mock-gemini-thinking-level').textContent(),
            { timeout: 15_000 }
        ).toContain('标准');
        await expect(controlled.getByTestId('mock-gemini-mode-label')).toContainText(initialModeLabel);

        await page.getByTestId('reasoning-effort').selectOption('high');
        await expect.poll(
            () => controlled.getByTestId('mock-gemini-thinking-level').textContent(),
            { timeout: 15_000 }
        ).toContain('扩展');
        await expect(controlled.getByTestId('mock-gemini-mode-label')).toContainText(initialModeLabel);

        await browser.close();
    } finally {
        kill(electronProcess);
        kill(desktopServer.process);
        mockServer.server.close();
    }
});

test('gemini-dom provider shows error state when mock page is unreachable', async () => {
    const desktopServer = await startContextServer(appRoot);
    const { browser, page, electronProcess } = await launchDesktopApp({
        contextBaseUrl: desktopServer.contextBaseUrl,
        syncBaseUrl: desktopServer.syncBaseUrl,
        domGeminiUrl: 'http://127.0.0.1:19998'
    });

    try {
        await openGeminiDomConversation(page);

        const inputArea = page.getByTestId('normal-input');
        await inputArea.fill('will this fail?');
        await page.getByTestId('normal-send').click();

        const errorOrWarning = page.getByTestId('normal-auth-warning').or(
            page.getByTestId('normal-error')
        );
        await expect(errorOrWarning).toBeVisible({ timeout: 30_000 });

        await browser.close();
    } finally {
        kill(electronProcess);
        kill(desktopServer.process);
    }
});
