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

test('desktop host boots with proxy runtime and can send a chatgpt-web message', async () => {
    const port = 9333;
    const electronEnv = {
        ...process.env,
        VITE_E2E: '1',
        CHATPRISM_DESKTOP_E2E_CHATGPT_AUTH: '0'
    };
    delete electronEnv.ELECTRON_RUN_AS_NODE;
    const stderrLog: string[] = [];
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

    try {
        const cdpEndpoint = await waitForCdpEndpoint(port, stderrLog);
        const browser = await chromium.connectOverCDP(cdpEndpoint);
        const page = await waitForFirstPage(browser);

        await expect(page.getByTestId('conversation-workspace')).toBeVisible();
        await expect(page.getByTestId('history-source-external')).toBeVisible();
        await expect(page.getByTestId('normal-provider')).toHaveValue('chatgpt-web');
        await expect(page.getByTestId('normal-auth-warning')).toContainText('当前桌面宿主的 ChatGPT 登录态不可用');
        await expect(page.getByTestId('normal-auth-recovery')).toHaveText('登录 ChatGPT');
        await expect(page.getByTestId('normal-provider').locator('option')).toContainText(['ChatGPT (Web)', 'Gemini (API)']);

        await page.evaluate(() => {
            return window.chatprismDesktop?.openProviderLoginWindow('chatgpt-web');
        });

        await browser.close();
    } finally {
        killElectron(electronProcess);
    }
});
