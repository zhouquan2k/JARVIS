/**
 * DOM 实时对话抓取 —— Electron 版独立探针
 *
 * 为什么用 Electron 而非 Playwright：
 *   ChatGPT 的 Cloudflare / bot 防护会反复挑战「自动化指纹」的浏览器（Playwright 即使用真实
 *   Chrome 渠道仍被 403）。Electron 普通 BrowserWindow 不带自动化标志，且复用主 app 的登录分区
 *   （persist:chatprism-*-dom），因此能像主 app 一样直接命中已登录会话、不触发人机验证。
 *
 * 复用「与线上完全相同」的插件 preload 逻辑，
 * 即 domChat/* 共享逻辑，验证的就是线上跑的注入/提取/结束检测。
 *
 * 用法：
 *   pnpm --filter @plugins/ai-agent probe:dom:electron -- chatgpt "美国第二大城市是哪里"
 *   pnpm --filter @plugins/ai-agent probe:dom:electron -- gemini  "印度的首都"
 *
 * 窗口内 Cmd/Ctrl+R 可不刷新页面重新注入；DevTools 自动打开便于检查 DOM。
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESKTOP_CONTROLLED_PAGE_DOM_EVENT_FROM_PAGE_CHANNEL } from '../../../apps/desktop2/shared/controlledPageBridge';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(PLUGIN_ROOT, '../..');
const DESKTOP2_ROOT = resolve(REPO_ROOT, 'apps/desktop2');
const ESBUILD_BIN = resolve(DESKTOP2_ROOT, 'node_modules/.bin/esbuild');

type Provider = 'chatgpt' | 'gemini';

interface ProviderSpec {
    providerId: string;
    url: string;
    partition: string;
    preloadOut: string;
    preloadSrc: string;
}

const SPECS: Record<Provider, ProviderSpec> = {
    chatgpt: {
        providerId: 'chatgpt-dom',
        url: 'https://chatgpt.com',
        partition: 'persist:chatprism-chatgpt-dom',
        preloadOut: resolve(PLUGIN_ROOT, 'dist/scripts/chatgpt-dom.probe.preload.cjs'),
        preloadSrc: resolve(REPO_ROOT, 'plugins/ai-agent/src/preload/chatgptDomPreload.ts')
    },
    gemini: {
        providerId: 'gemini-dom',
        url: 'https://gemini.google.com/app',
        partition: 'persist:chatprism-gemini-dom',
        preloadOut: resolve(PLUGIN_ROOT, 'dist/scripts/gemini-dom.probe.preload.cjs'),
        preloadSrc: resolve(REPO_ROOT, 'plugins/ai-agent/src/preload/geminiDomPreload.ts')
    }
};

function parseArgs(): { provider: Provider; prompt: string } {
    const args = process.argv.slice(2).filter((a) => a !== '--');
    const provider = (args.find((a) => a === 'chatgpt' || a === 'gemini') ?? 'chatgpt') as Provider;
    const prompt = args.find((a) => !a.startsWith('--') && a !== provider) ?? '美国第二大城市是哪里，请简要说明';
    return { provider, prompt };
}

function buildPreload(spec: ProviderSpec): boolean {
    try {
        console.log('[probe-e] building preload:', spec.providerId);
        execSync(
            `"${ESBUILD_BIN}" ${spec.preloadSrc} --bundle --platform=node --format=cjs --target=node18 --outfile=${spec.preloadOut} --external:electron --alias:@packages/core=../../packages/core --alias:@packages/ui=../../packages/ui`,
            { cwd: DESKTOP2_ROOT, stdio: 'inherit' }
        );
        return true;
    } catch (err) {
        console.error('[probe-e] preload build failed:', err);
        return false;
    }
}

const { provider, prompt } = parseArgs();
const spec = SPECS[provider];
let win: BrowserWindow | null = null;
let start = 0;

function isDirectExecution(): boolean {
    const entry = process.argv[1];
    return Boolean(entry && resolve(entry) === fileURLToPath(import.meta.url));
}

function inject() {
    if (!win || win.isDestroyed()) return;
    start = Date.now();
    const requestId = `probe-${Date.now()}`;
    console.log(`\n[probe-e] 注入 prompt=${JSON.stringify(prompt)} requestId=${requestId}`);
    win.webContents
        .executeJavaScript(
            `window.__jarvisInjectPrompt(${JSON.stringify(prompt)}, ${JSON.stringify(requestId)})`,
            true
        )
        .catch((err) => console.error('[probe-e] inject executeJavaScript error:', err));
}

function registerDomEvents() {
    ipcMain.on(DESKTOP_CONTROLLED_PAGE_DOM_EVENT_FROM_PAGE_CHANNEL, (_e, payload: {
        providerId: string;
        requestId: string;
        type: 'chunk' | 'done' | 'error';
        text?: string;
        message?: string;
    }) => {
        if (payload.providerId !== spec.providerId) return;
        const t = Date.now() - start;
        if (payload.type === 'chunk') {
            const text = payload.text ?? '';
            const preview = text.length > 80 ? `${text.slice(0, 40)}…${text.slice(-30)}` : text;
            console.log(`[probe-e +${t}ms] snapshot len=${text.length} :: ${preview.replace(/\n/g, '⏎')}`);
        } else if (payload.type === 'done') {
            const text = payload.text ?? '';
            console.log('\n========== 最终结果 ==========');
            console.log(`elapsed=${t}ms len=${text.length}`);
            console.log('------------------------------');
            console.log(text || '(空)');
            console.log('==============================');
            console.log('[probe-e] 按 Cmd/Ctrl+R 可重新注入；关闭窗口退出。\n');
        } else if (payload.type === 'error') {
            console.error(`[probe-e +${t}ms] error: ${payload.message}`);
            console.error('[probe-e] 若是「input not found / 未登录」，请在窗口里登录后按 Cmd/Ctrl+R 重试。');
        }
    });
}

function createWindow() {
    if (!existsSync(spec.preloadOut)) {
        console.error('[probe-e] preload not found:', spec.preloadOut);
        app.quit();
        return;
    }

    win = new BrowserWindow({
        width: 1280,
        height: 900,
        title: `DOM Chat Probe — ${spec.providerId}`,
        webPreferences: {
            partition: spec.partition,
            preload: spec.preloadOut,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            backgroundThrottling: false
        }
    });

    win.webContents.openDevTools({ mode: 'detach' });

    win.webContents.on('console-message', (_e, _level, msg) => {
        if (msg.includes('DomPreload')) console.log('[window]', msg);
    });

    win.webContents.on('did-finish-load', async () => {
        console.log('[probe-e] page loaded:', win!.webContents.getURL());
        console.log('[probe-e] 等待页面渲染后自动注入（若未登录会收到 error，登录后按 Cmd/Ctrl+R 重试）...');
        await new Promise((r) => setTimeout(r, 3500));
        inject();
    });

    win.webContents.on('before-input-event', (event, input) => {
        if ((input.meta || input.control) && input.key === 'r' && !input.shift) {
            event.preventDefault();
            console.log('[probe-e] 重新注入 (Cmd/Ctrl+R)...');
            inject();
        }
    });

    console.log(`[probe-e] provider=${spec.providerId} partition=${spec.partition}`);
    console.log('[probe-e] loading', spec.url);
    void win.loadURL(spec.url);
}

if (isDirectExecution()) {
    app.whenReady().then(() => {
        buildPreload(spec);
        registerDomEvents();
        createWindow();
        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });

    app.on('window-all-closed', () => app.quit());
}
