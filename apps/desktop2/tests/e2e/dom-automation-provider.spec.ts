/**
 * e2e: DOM automation provider (chatgpt-dom)
 *
 * Uses a local mock page that mirrors ChatGPT's DOM selectors.
 * Validates the full chain: preload injection → MutationObserver →
 * page→main→renderer IPC → DomAutomationProvider → UI assistant message.
 *
 * AGENTS.md: desktop e2e must use channel:'chromium'; requires elevated sandbox.
 */
import { chromium, expect, test } from '@playwright/test';
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
const mockChatGptHtml = join(__dirname, 'fixtures/mock-chatgpt.html');

// ── helpers re-used from desktop-host.spec.ts ──────────────────────────────

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

// Locate the hidden controlled page (the mock ChatGPT BrowserWindow) over CDP,
// matched by its URL prefix (host:port), tolerating SPA pushState to /c/<id>.
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

// ── mock ChatGPT HTTP server ────────────────────────────────────────────────

async function startMockChatGptServer(): Promise<{ server: Server; url: string }> {
    const html = await readFile(mockChatGptHtml, 'utf8');
    const server = createServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html);
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('Failed to start mock ChatGPT server');

    return { server, url: `http://127.0.0.1:${addr.port}` };
}

// ── launch helpers ─────────────────────────────────────────────────────────

async function launchDesktopApp(options: {
    contextBaseUrl: string;
    syncBaseUrl: string;
    domChatGptUrl: string;
}) {
    const port = 9600 + Math.floor(Math.random() * 200);
    const stderrLog: string[] = [];
    const stdoutLog: string[] = [];
    const proc = spawn(
        electronBinary,
        [desktopEntry, `--remote-debugging-port=${port}`],
        {
            env: {
                ...process.env,
                VITE_E2E: '1',
                CHATPRISM_SYNC_KEY: 'dom-e2e',
                CHATPRISM_CONTEXT_BASE_URL: options.contextBaseUrl,
                CHATPRISM_SYNC_BASE_URL: options.syncBaseUrl,
                CHATPRISM_KNOWLEDGE_ROOT: appRoot,
                CHATPRISM_DOM_CHATGPT_URL: options.domChatGptUrl,
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

// ── helpers: navigate to conversation view and select chatgpt-dom ──────────

async function openDomConversation(page: Awaited<ReturnType<typeof waitForFirstPage>>) {
    await expect(page.getByTestId('topbar-workspace-normal-chat')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('topbar-workspace-normal-chat').click();
    await expect(page.getByTestId('conversation-workspace')).toBeVisible();
    await expect(page.getByTestId('normal-provider')).toBeVisible();

    // The provider dropdown is disabled when the default provider lacks auth, and
    // workspace init asynchronously re-applies the persisted/default provider — both
    // make UI-driven selection racy. In e2e we drive the Pinia store action directly
    // (main.ts exposes window.__pinia under VITE_E2E), which deterministically sets
    // currentProviderId to chatgpt-dom for the real send path.
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
        // New conversations adopt the agent default provider by design; a manual
        // provider choice only outranks the default AFTER the conversation exists.
        // So create the conversation first, then drive the user-level (explicit)
        // selection so it survives the subsequent send.
        if (!store.currentConversation) {
            await store.startNewConversation();
        }
        await store.setCurrentModelProviderByUser(providerId);
        return 'switched:' + store.currentProviderId;
    }, 'chatgpt-dom');
    if (!switchResult.startsWith('switched:chatgpt-dom')) {
        throw new Error(`Failed to switch provider via store: ${switchResult}`);
    }

    // chatgpt-dom.checkAuth() always returns true, so the input must become enabled
    // once models have loaded and auth has been checked.
    await expect(page.getByTestId('normal-input')).toBeEnabled({ timeout: 15_000 });
}

// Re-assert chatgpt-dom right before sending. Workspace init can asynchronously
// re-apply the default provider after openDomConversation, so we deterministically
// drive the store again immediately before each send to avoid that race.
async function ensureDomProviderSelected(page: Awaited<ReturnType<typeof waitForFirstPage>>) {
    const result = await page.evaluate(async (providerId) => {
        const pinia = (window as unknown as { __pinia?: { _s: Map<string, unknown> } }).__pinia;
        const store = pinia?._s.get('chat') as
            | { setCurrentModelProviderByUser(id: string): Promise<void>; currentProviderId: string }
            | undefined;
        if (!store) return 'no chat store';
        if (store.currentProviderId !== providerId) {
            await store.setCurrentModelProviderByUser(providerId);
        }
        return 'current:' + store.currentProviderId;
    }, 'chatgpt-dom');
    if (result !== 'current:chatgpt-dom') {
        throw new Error(`Failed to keep chatgpt-dom selected before send: ${result}`);
    }
}

// ── tests ──────────────────────────────────────────────────────────────────

test('chatgpt-dom provider appears in desktop provider selector', async () => {
    const desktopServer = await startContextServer(appRoot);
    const { browser, page, electronProcess } = await launchDesktopApp({
        contextBaseUrl: desktopServer.contextBaseUrl,
        syncBaseUrl: desktopServer.syncBaseUrl,
        domChatGptUrl: 'http://127.0.0.1:1' // dummy — just checking catalog
    });

    try {
        await expect(page.getByTestId('topbar-workspace-normal-chat')).toBeVisible({ timeout: 15_000 });
        await page.getByTestId('topbar-workspace-normal-chat').click();
        await expect(page.getByTestId('conversation-workspace')).toBeVisible();

        const options = page.getByTestId('normal-provider').locator('option');
        await expect(options).toContainText(['ChatGPT (DOM)']);

        await browser.close();
    } finally {
        kill(electronProcess);
        kill(desktopServer.process);
    }
});

test('chatgpt-dom provider streams reply via mock page and shows assistant message', async () => {
    const desktopServer = await startContextServer(appRoot);
    const mockServer = await startMockChatGptServer();
    const { browser, page, electronProcess, stdoutLog } = await launchDesktopApp({
        contextBaseUrl: desktopServer.contextBaseUrl,
        syncBaseUrl: desktopServer.syncBaseUrl,
        domChatGptUrl: mockServer.url
    });

    // Capture renderer console (DomAutomationProvider/DomTransport logs run here)
    const rendererLogs: string[] = [];
    page.on('console', (msg) => {
        const text = msg.text();
        if (text.includes('[Dom') || text.includes('[ChatGPT') || text.includes('[Controlled')) {
            rendererLogs.push(text);
        }
    });
    page.on('pageerror', (err) => rendererLogs.push('[pageerror] ' + String(err)));

    try {
        await openDomConversation(page);

        // Type and send a message
        const inputArea = page.getByTestId('normal-input');
        await expect(inputArea).toBeVisible();
        await inputArea.fill('Hello from e2e test');
        // Re-assert chatgpt-dom right before send: a manual (explicit) provider choice
        // only outranks the agent default once the conversation exists, so we keep it
        // pinned deterministically before driving the real send.
        await ensureDomProviderSelected(page);
        await page.getByTestId('normal-send').click();

        // Wait for the assistant reply to contain the mock response text.
        // Messages use CSS class .message.assistant, no data-testid.
        const assistantMsg = page.getByTestId('normal-messages').locator('.message.assistant').last();
        await expect(assistantMsg).toContainText(
            'Hello! I am a mock ChatGPT response',
            { timeout: 30_000 }
        ).catch(async (err: unknown) => {
            // Dump renderer + main logs and store state so we can diagnose the chain
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

test('chatgpt-dom provider reuses the same DOM conversation across turns (no reload)', async () => {
    const desktopServer = await startContextServer(appRoot);
    const mockServer = await startMockChatGptServer();
    const { browser, page, electronProcess } = await launchDesktopApp({
        contextBaseUrl: desktopServer.contextBaseUrl,
        syncBaseUrl: desktopServer.syncBaseUrl,
        domChatGptUrl: mockServer.url
    });

    try {
        await openDomConversation(page);

        const inputArea = page.getByTestId('normal-input');
        const assistantMessages = page.getByTestId('normal-messages').locator('.message.assistant');

        // ── Turn 1: starts a fresh DOM conversation ──
        await ensureDomProviderSelected(page);
        await inputArea.fill('first question from turn one');
        await page.getByTestId('normal-send').click();
        await expect(assistantMessages).toHaveCount(1, { timeout: 30_000 });
        await expect(assistantMessages.first()).toContainText('Hello! I am a mock ChatGPT response', { timeout: 30_000 });

        // Controlled page should have navigated to a per-conversation URL (/c/<id>).
        const controlled = await findControlledPage(browser, mockServer.url);
        await expect.poll(() => controlled.url(), { timeout: 10_000 }).toContain('/c/');
        const turn1Url = controlled.url();

        // ── Turn 2: must continue the SAME conversation, not reload base url ──
        await ensureDomProviderSelected(page);
        await inputArea.fill('second question from turn two');
        await page.getByTestId('normal-send').click();
        await expect(assistantMessages).toHaveCount(2, { timeout: 30_000 });

        // The controlled page must NOT have been reloaded back to the base url:
        // it stays on the same /c/<id> conversation, and turn-1's user message
        // is still present in its DOM (a base-url reload would have wiped it).
        expect(controlled.url()).toBe(turn1Url);
        const userMessages = controlled.locator('[data-message-author-role="user"]');
        await expect(userMessages).toHaveCount(2, { timeout: 10_000 });
        await expect(userMessages.nth(0)).toContainText('first question from turn one');
        await expect(userMessages.nth(1)).toContainText('second question from turn two');

        await browser.close();
    } finally {
        kill(electronProcess);
        kill(desktopServer.process);
        mockServer.server.close();
    }
});

test('chatgpt-dom reasoning selector updates the ChatGPT pill without changing the current model', async () => {
    const desktopServer = await startContextServer(appRoot);
    const mockServer = await startMockChatGptServer();
    const { browser, page, electronProcess } = await launchDesktopApp({
        contextBaseUrl: desktopServer.contextBaseUrl,
        syncBaseUrl: desktopServer.syncBaseUrl,
        domChatGptUrl: mockServer.url
    });
    const rendererLogs: string[] = [];
    page.on('console', (msg) => {
        const text = msg.text();
        if (text.includes('[Dom') || text.includes('[ChatGPT') || text.includes('[Controlled') || text.includes('[ChatStore')) {
            rendererLogs.push(text);
        }
    });

    try {
        await openDomConversation(page);
        const controlled = await findControlledPage(browser, mockServer.url);
        const dumpReasoningDiagnostics = async (label: string) => {
            const storeState = await page.evaluate(() => {
                const pinia = (window as unknown as { __pinia?: { _s: Map<string, unknown> } }).__pinia;
                const store = pinia?._s.get('chat') as
                    | { currentProviderId: string; currentModelId: string; currentReasoningEffort: string }
                    | undefined;
                return store
                    ? {
                        currentProviderId: store.currentProviderId,
                        currentModelId: store.currentModelId,
                        currentReasoningEffort: store.currentReasoningEffort
                    }
                    : { currentProviderId: null, currentModelId: null, currentReasoningEffort: null };
            }).catch(() => ({ currentProviderId: 'eval-failed', currentModelId: null, currentReasoningEffort: null }));
            const controlledState = await controlled.evaluate(() => ({
                currentModel: document.querySelector('[data-testid="mock-chatgpt-current-model"]')?.textContent?.trim() ?? null,
                currentReasoning: document.querySelector('[data-testid="mock-chatgpt-current-reasoning"]')?.textContent?.trim() ?? null,
                pillLabel: document.querySelector('button.__composer-pill[aria-haspopup="menu"]')?.textContent?.trim() ?? null
            })).catch(() => ({ currentModel: 'eval-failed', currentReasoning: null, pillLabel: null }));
            console.error(`[test-diagnostic:${label}] store state:`, JSON.stringify(storeState));
            console.error(`[test-diagnostic:${label}] controlled state:`, JSON.stringify(controlledState));
            console.error(`[test-diagnostic:${label}] renderer logs (${rendererLogs.length}):\n`, rendererLogs.join('\n') || '(none)');
        };
        await expect.poll(
            () => controlled.getByTestId('mock-chatgpt-current-reasoning').textContent(),
            { timeout: 15_000 }
        ).toContain('高级');
        await expect.poll(
            () => controlled.getByTestId('mock-chatgpt-current-model').textContent(),
            { timeout: 15_000 }
        ).toContain('GPT-5.5').catch(async (err: unknown) => {
            await dumpReasoningDiagnostics('initial-model-sync');
            throw err;
        });
        const initialModelLabel = (await controlled.getByTestId('mock-chatgpt-current-model').textContent())?.trim() ?? '';
        await expect(controlled.getByTestId('mock-chatgpt-current-model')).toContainText(initialModelLabel);

        await page.getByTestId('reasoning-effort').selectOption('low');
        await expect.poll(
            () => controlled.getByTestId('mock-chatgpt-current-reasoning').textContent(),
            { timeout: 15_000 }
        ).toContain('极速').catch(async (err: unknown) => {
            await dumpReasoningDiagnostics('switch-low');
            throw err;
        });
        await expect(controlled.getByTestId('mock-chatgpt-current-model')).toContainText(initialModelLabel);

        await page.getByTestId('reasoning-effort').selectOption('high');
        await expect.poll(
            () => controlled.getByTestId('mock-chatgpt-current-reasoning').textContent(),
            { timeout: 15_000 }
        ).toContain('高级').catch(async (err: unknown) => {
            await dumpReasoningDiagnostics('switch-high');
            throw err;
        });
        await expect(controlled.getByTestId('mock-chatgpt-current-model')).toContainText(initialModelLabel);

        await browser.close();
    } finally {
        kill(electronProcess);
        kill(desktopServer.process);
        mockServer.server.close();
    }
});

test('chatgpt-dom model selector updates the ChatGPT submenu model without changing reasoning', async () => {
    const desktopServer = await startContextServer(appRoot);
    const mockServer = await startMockChatGptServer();
    const { browser, page, electronProcess } = await launchDesktopApp({
        contextBaseUrl: desktopServer.contextBaseUrl,
        syncBaseUrl: desktopServer.syncBaseUrl,
        domChatGptUrl: mockServer.url
    });
    const rendererLogs: string[] = [];
    page.on('console', (msg) => {
        const text = msg.text();
        if (text.includes('[Dom') || text.includes('[ChatGPT') || text.includes('[Controlled')) {
            rendererLogs.push(text);
        }
    });

    try {
        await openDomConversation(page);
        const controlled = await findControlledPage(browser, mockServer.url);
        await expect.poll(
            () => controlled.getByTestId('mock-chatgpt-current-model').textContent(),
            { timeout: 15_000 }
        ).toContain('GPT-5.5');
        await expect.poll(
            () => controlled.getByTestId('mock-chatgpt-current-reasoning').textContent(),
            { timeout: 15_000 }
        ).toContain('高级');
        const initialReasoning = (await controlled.getByTestId('mock-chatgpt-current-reasoning').textContent())?.trim() ?? '';

        await expect(page.getByTestId('normal-model')).toBeEnabled({ timeout: 15_000 });
        await page.getByTestId('normal-model').selectOption('gpt-5.4');
        await expect(page.getByTestId('normal-model')).toHaveValue('gpt-5.4');
        await expect.poll(
            () => controlled.getByTestId('mock-chatgpt-current-model').textContent(),
            { timeout: 15_000 }
        ).toContain('GPT-5.4').catch(async (err: unknown) => {
            const storeState = await page.evaluate(() => {
                const pinia = (window as unknown as { __pinia?: { _s: Map<string, unknown> } }).__pinia;
                const store = pinia?._s.get('chat') as
                    | { currentProviderId: string; currentModelId: string; currentReasoningEffort: string }
                    | undefined;
                return store
                    ? {
                        currentProviderId: store.currentProviderId,
                        currentModelId: store.currentModelId,
                        currentReasoningEffort: store.currentReasoningEffort
                    }
                    : { currentProviderId: null, currentModelId: null, currentReasoningEffort: null };
            }).catch(() => ({ currentProviderId: 'eval-failed', currentModelId: null, currentReasoningEffort: null }));
            const controlledState = await controlled.evaluate(() => ({
                currentModel: document.querySelector('[data-testid="mock-chatgpt-current-model"]')?.textContent?.trim() ?? null,
                currentReasoning: document.querySelector('[data-testid="mock-chatgpt-current-reasoning"]')?.textContent?.trim() ?? null
            })).catch(() => ({ currentModel: 'eval-failed', currentReasoning: null }));
            console.error('[test-diagnostic] store state:', JSON.stringify(storeState));
            console.error('[test-diagnostic] controlled state:', JSON.stringify(controlledState));
            console.error('[test-diagnostic] renderer logs (' + rendererLogs.length + '):\n', rendererLogs.join('\n') || '(none)');
            throw err;
        });
        await expect(controlled.getByTestId('mock-chatgpt-current-reasoning')).toContainText(initialReasoning);

        await page.getByTestId('normal-model').selectOption('o3');
        await expect.poll(
            () => controlled.getByTestId('mock-chatgpt-current-model').textContent(),
            { timeout: 15_000 }
        ).toContain('o3');
        await expect(controlled.getByTestId('mock-chatgpt-current-reasoning')).toContainText(initialReasoning);

        await browser.close();
    } finally {
        kill(electronProcess);
        kill(desktopServer.process);
        mockServer.server.close();
    }
});

test('chatgpt-dom provider shows error state when mock page is unreachable', async () => {
    const desktopServer = await startContextServer(appRoot);
    // Point to a port with nothing listening → open will time out / fail
    const { browser, page, electronProcess } = await launchDesktopApp({
        contextBaseUrl: desktopServer.contextBaseUrl,
        syncBaseUrl: desktopServer.syncBaseUrl,
        domChatGptUrl: 'http://127.0.0.1:19999'
    });

    try {
        await openDomConversation(page);

        const inputArea = page.getByTestId('normal-input');
        await expect(inputArea).toBeVisible();
        await inputArea.fill('will this fail?');
        await page.getByTestId('normal-send').click();

        // Auth warning or error state should appear (provider unreachable)
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
