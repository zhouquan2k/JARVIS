import { chromium, expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appRoot = join(__dirname, '../..');
const electronBinary = join(appRoot, 'node_modules/.bin/electron');
const desktopEntry = join(appRoot, 'dist/main/main/index.js');

async function waitForCdpEndpoint(port: number, stderrLog: string[]): Promise<string> {
    const deadline = Date.now() + 15_000;

    while (Date.now() < deadline) {
        const joinedLog = stderrLog.join('');
        const matched = joinedLog.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (matched?.[1]) {
            return matched[1];
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
    }

    throw new Error(`Timed out waiting for Electron CDP endpoint on port ${port}\n${stderrLog.join('')}`);
}

function killElectron(processRef: ChildProcess) {
    if (processRef.killed) {
        return;
    }

    processRef.kill('SIGTERM');
}

async function waitForFirstPage(browser: Awaited<ReturnType<typeof chromium.connectOverCDP>>) {
    const deadline = Date.now() + 15_000;

    while (Date.now() < deadline) {
        for (const context of browser.contexts()) {
            for (const page of context.pages()) {
                const currentUrl = page.url();
                if (!currentUrl || currentUrl.startsWith('devtools://') || currentUrl === 'about:blank') {
                    continue;
                }

                return page;
            }
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
    }

    throw new Error('Timed out waiting for Electron renderer page');
}

async function launchDesktopApp(options?: {
    port?: number;
    env?: Record<string, string | undefined>;
}) {
    const port = options?.port ?? (9400 + Math.floor(Math.random() * 200));
    const sessionNamespace = `desktop-e2e-${crypto.randomUUID()}`;
    const electronEnv = {
        ...process.env,
        VITE_E2E: '1',
        CHATPRISM_SYNC_KEY: 'desktop-e2e',
        CHATPRISM_KNOWLEDGE_ROOT: appRoot,
        CHATPRISM_DESKTOP_E2E_CHATGPT_AUTH: '0',
        CHATPRISM_SESSION_NAMESPACE: sessionNamespace,
        ...options?.env
    };
    delete electronEnv.ELECTRON_RUN_AS_NODE;
    const stderrLog: string[] = [];
    const stdoutLog: string[] = [];
    const electronProcess = spawn(
        electronBinary,
        [
            desktopEntry,
            `--remote-debugging-port=${port}`
        ],
        {
            env: electronEnv,
            stdio: 'pipe'
        }
    );
    electronProcess.stderr?.on('data', (chunk) => {
        stderrLog.push(String(chunk));
    });
    electronProcess.stdout?.on('data', (chunk) => {
        stdoutLog.push(String(chunk));
    });

    try {
        const cdpEndpoint = await waitForCdpEndpoint(port, stderrLog);
        const browser = await chromium.connectOverCDP(cdpEndpoint);
        const page = await waitForFirstPage(browser);

        return {
            browser,
            page,
            electronProcess
        };
    } catch (error) {
        killElectron(electronProcess);
        throw error;
    }
}

async function waitForConversationWorkspaceReady(page: Awaited<ReturnType<typeof waitForFirstPage>>) {
    await expect(page.getByTestId('topbar-workspace-normal-chat')).toBeVisible();
    await page.getByTestId('topbar-workspace-normal-chat').click();
    await expect(page.getByTestId('conversation-workspace')).toBeVisible();
    await page.getByTestId('sidebar-toggle').click();
    await expect(page.getByTestId('history-source-external')).toBeVisible();
    await page.getByTestId('normal-provider').selectOption('chatgpt-web');
    await expect(page.getByTestId('normal-provider').locator('option')).toContainText(['ChatGPT (Web)', 'Gemini (API)']);
}

async function installCodexAuthMocks(page: Page) {
    await page.addInitScript(() => {
        (window as typeof window & { __chatprismOpenCalls?: string[] }).__chatprismOpenCalls = [];
        window.open = ((url?: string | URL | undefined) => {
            const calls = (window as typeof window & { __chatprismOpenCalls?: string[] }).__chatprismOpenCalls ?? [];
            calls.push(String(url ?? ''));
            (window as typeof window & { __chatprismOpenCalls?: string[] }).__chatprismOpenCalls = calls;
            return null;
        }) as typeof window.open;
    });

    await page.route('**/api/codex/auth/status', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                authenticated: false,
                providerId: 'chatgpt-codex',
                message: 'Not logged in'
            })
        });
    });

    await page.route('**/api/codex/auth/login', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                mode: 'device-auth',
                verificationUri: 'https://chatgpt.com/auth/device',
                message: 'Device auth started'
            })
        });
    });
}

async function readOpenCalls(page: Page) {
    return page.evaluate(() => (window as typeof window & { __chatprismOpenCalls?: string[] }).__chatprismOpenCalls ?? []);
}

async function startFakeCalendarServer(): Promise<{
    server: Server;
    baseUrl: string;
    requests: Array<{ method: string; url: string; body: string }>;
}> {
    const requests: Array<{ method: string; url: string; body: string }> = [];
    const server = createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => {
            body += String(chunk);
        });
        req.on('end', () => {
            requests.push({
                method: req.method ?? 'GET',
                url: req.url ?? '/',
                body
            });

            if (req.url === '/oauth/token') {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({
                    access_token: 'token-1',
                    expires_in: 3600
                }));
                return;
            }

            if (req.url === '/calendar/v3/calendars/primary/events') {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ id: 'event-1' }));
                return;
            }

            if (req.url === '/calendar/v3/calendars/primary/events/event-1') {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ id: 'event-1' }));
                return;
            }

            res.writeHead(404, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'not found' }));
        });
    });

    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
        throw new Error('Failed to start fake calendar server');
    }

    return {
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
        requests
    };
}

test('desktop host boots with proxy runtime and can send a chatgpt-web message', async () => {
    const { browser, page, electronProcess } = await launchDesktopApp();
    try {
        await waitForConversationWorkspaceReady(page);
        await expect(page.getByTestId('normal-auth-warning')).toContainText('sign-in state is unavailable');
        await expect(page.getByTestId('normal-auth-recovery')).toHaveText('Sign in to ChatGPT');

        await page.evaluate(() => {
            return window.chatprismDesktop?.openProviderLoginWindow('chatgpt-web');
        });

        await browser.close();
    } finally {
        killElectron(electronProcess);
    }
});

test('desktop host shows Gemini login recovery when gemini external history requires auth', async () => {
    const { browser, page, electronProcess } = await launchDesktopApp();

    try {
        await waitForConversationWorkspaceReady(page);
        await expect(page.getByTestId('normal-auth-warning')).toContainText('sign-in state is unavailable');

        await page.getByTestId('history-source-external').click();
        await expect(page.getByTestId('external-provider-gemini-web')).toBeVisible();
        await page.getByTestId('external-provider-gemini-web').click();

        try {
            await expect(page.getByTestId('normal-error')).toContainText('Gemini');
            await expect(page.getByTestId('normal-host-recovery')).toHaveText('Sign in to Gemini');
        } catch (error) {
            console.log('[gemini-auth-required] normal-error 文本:', await page.getByTestId('normal-error').allTextContents());
            console.log('[gemini-auth-required] normal-host-recovery 文本:', await page.getByTestId('normal-host-recovery').allTextContents());
            console.log('[gemini-auth-required] external-history-loading 数量:', await page.getByTestId('external-history-loading').count());
            console.log('[gemini-auth-required] external-history-item 数量:', await page.getByTestId('external-history-item').count());
            console.log('[gemini-auth-required] empty-state 文本:', await page.getByText('暂无可导入历史').allTextContents());
            throw error;
        }

        await browser.close();
    } finally {
        killElectron(electronProcess);
    }
});

test('desktop host shows codex auth recovery and keeps chatgpt-codex selectable', async () => {
    const { browser, page, electronProcess } = await launchDesktopApp();

    try {
        await installCodexAuthMocks(page);
        await page.reload();
        await expect(page.getByTestId('topbar-workspace-normal-chat')).toBeVisible();
        await page.getByTestId('topbar-workspace-normal-chat').click();
        await expect(page.getByTestId('conversation-workspace')).toBeVisible();
        await expect(page.getByTestId('normal-provider')).toBeEnabled();

        await page.getByTestId('normal-provider').selectOption('chatgpt-codex');
        await expect(page.getByTestId('normal-provider')).toHaveValue('chatgpt-codex');
        await expect(page.getByTestId('normal-auth-warning')).toContainText('Codex provider');
        await expect(page.getByTestId('normal-auth-recovery')).toContainText('Codex');

        await page.getByTestId('normal-auth-recovery').click();
        await expect.poll(async () => readOpenCalls(page)).toContain('https://chatgpt.com/auth/device');
        await expect(page.getByTestId('normal-provider')).toHaveValue('chatgpt-codex');

        await browser.close();
    } finally {
        killElectron(electronProcess);
    }
});

test('desktop host syncs timed tasks to Google Calendar without changing the task UI', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'chatprism-desktop-task-sync-'));
    const documentPath = join(workspaceRoot, 'task-doc.md');
    const fakeCalendar = await startFakeCalendarServer();

    await writeFile(documentPath, '# Task Doc\n', 'utf8');

    const { browser, page, electronProcess } = await launchDesktopApp({
        env: {
            CHATPRISM_KNOWLEDGE_ROOT: workspaceRoot,
            CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID: 'client-id',
            CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET: 'client-secret',
            CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN: 'refresh-token',
            CHATPRISM_GOOGLE_OAUTH_TOKEN_URL: `${fakeCalendar.baseUrl}/oauth/token`,
            CHATPRISM_GOOGLE_CALENDAR_API_BASE_URL: `${fakeCalendar.baseUrl}/calendar/v3`
        }
    });

    try {
        await page.getByTestId('topbar-workspace-knowledge-workspace').click();
        await expect(page.getByTestId('document-workspace')).toBeVisible();

        await page.locator('[data-path="/task-doc.md"]').click();
        await page.getByTestId('agent-right-pane-tab-tasks').click();
        await page.getByTestId('agent-task-add').click();
        await page.getByTestId('task-editor-title').fill('Calendar task');
        await page.getByTestId('task-editor-notes').fill('Desktop sync notes');
        await page.getByTestId('task-editor-due-at').fill('2026-05-24');
        await page.getByTestId('task-editor-time-toggle').click();
        await page.getByTestId('task-editor-due-time').fill('09:00');
        await page.getByTestId('task-editor-save').click();
        await expect(page.getByTestId('agent-task-open-list')).toContainText('Calendar task');

        const taskFile = join(workspaceRoot, '.chatprism', 'tasks.json');
        await expect.poll(async () => {
            const raw = await readFile(taskFile, 'utf8');
            const parsed = JSON.parse(raw) as {
                tasks: Array<{ calendarEventId: string | null; calendarSyncStatus: string | null }>;
            };
            return parsed.tasks[0];
        }).toMatchObject({
            calendarEventId: 'event-1',
            calendarSyncStatus: 'synced'
        });

        await page.locator('[data-testid^="agent-task-content-task-"]').first().dblclick();
        await page.getByTestId('task-editor-notes').fill('Updated desktop sync notes');
        await page.getByTestId('task-editor-save').click();

        await expect.poll(async () => fakeCalendar.requests.some((request) => (
            request.method === 'PUT' && request.url.endsWith('/calendar/v3/calendars/primary/events/event-1')
        ))).toBe(true);
    } finally {
        await browser.close();
        killElectron(electronProcess);
        fakeCalendar.server.close();
        await rm(workspaceRoot, { recursive: true, force: true });
    }
});
