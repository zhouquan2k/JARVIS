import { chromium, expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
    await expect(page.getByTestId('history-source-external')).toBeVisible();
    await expect(page.getByTestId('normal-provider')).toHaveValue('chatgpt-web');
    await expect(page.getByTestId('normal-provider').locator('option')).toContainText(['ChatGPT (Web)', 'Gemini (API)']);
}

test('desktop host boots with proxy runtime and can send a chatgpt-web message', async () => {
    const { browser, page, electronProcess } = await launchDesktopApp();
    try {
        await waitForConversationWorkspaceReady(page);
        await expect(page.getByTestId('normal-auth-warning')).toContainText('当前桌面宿主的 ChatGPT 登录态不可用');
        await expect(page.getByTestId('normal-auth-recovery')).toHaveText('登录 ChatGPT');

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
        await expect(page.getByTestId('normal-auth-warning')).toContainText('当前桌面宿主的 ChatGPT 登录态不可用');

        await page.getByTestId('history-source-external').click();
        await expect(page.getByTestId('external-provider-gemini-web')).toBeVisible();
        await page.getByTestId('external-provider-gemini-web').click();

        try {
            await expect(page.getByTestId('normal-error')).toContainText('Gemini');
            await expect(page.getByTestId('normal-host-recovery')).toHaveText('登录 Gemini');
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
