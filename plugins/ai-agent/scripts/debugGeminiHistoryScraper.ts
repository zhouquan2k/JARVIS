/**
 * Gemini History Scraper 独立调试工具
 *
 * 用法：
 *   pnpm --filter @plugins/ai-agent debug:gemini          # 单次运行
 *   pnpm --filter @plugins/ai-agent debug:gemini -- --watch # 监视 preload 源码，自动重建并重新执行
 *
 * 复用 persist:chatprism-gemini 分区（与主 app 共享登录态），无需重新登录。
 * DevTools 自动打开，可实时检查 DOM。
 * 窗口内按 Cmd+R / Ctrl+R 重新执行 scraper（不重启 Electron）。
 */

import { app, BrowserWindow } from 'electron';
import { execSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, watchFile } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// __dirname is plugins/ai-agent/dist/scripts when bundled.
const PLUGIN_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(PLUGIN_ROOT, '../..');
const DESKTOP2_ROOT = resolve(REPO_ROOT, 'apps/desktop2');

const LOG_FILE = resolve(PLUGIN_ROOT, 'dist/debug-gemini.log');
function fileLog(line: string): void {
    try {
        appendFileSync(LOG_FILE, `${line}\n`);
    } catch {
        // 落盘失败不影响调试主流程
    }
}

const GEMINI_URL = 'https://gemini.google.com/app';
const PARTITION = 'persist:chatprism-gemini';
const PRELOAD_OUT = resolve(PLUGIN_ROOT, 'dist/scripts/debug-gemini-history.preload.cjs');
const PRELOAD_SRC = resolve(REPO_ROOT, 'plugins/ai-agent/src/preload/geminiHistoryPreload.ts');
const SCRAPER_SRC = resolve(REPO_ROOT, 'plugins/ai-agent/src/providers/history/gemini/geminiHistoryBridgeCore.ts');
const CONFIG_JSON = resolve(REPO_ROOT, 'apps/server/src/provider-configs/gemini-history.json');
const ESBUILD_BIN = resolve(DESKTOP2_ROOT, 'node_modules/.bin/esbuild');

const watchMode = process.argv.includes('--watch');
let win: BrowserWindow | null = null;

function isDirectExecution(): boolean {
    const entry = process.argv[1];
    return Boolean(entry && resolve(entry) === fileURLToPath(import.meta.url));
}

function loadConfig() {
    const raw = readFileSync(CONFIG_JSON, 'utf8');
    return JSON.parse(raw);
}

function buildPreload(): boolean {
    try {
        console.log('[debug-gemini] Building preload...');
        execSync(
            `"${ESBUILD_BIN}" "${PRELOAD_SRC}" --bundle --platform=node --format=cjs --target=node18 --outfile="${PRELOAD_OUT}" --external:electron --alias:@packages/core=../../packages/core --alias:@packages/ui=../../packages/ui`,
            { cwd: DESKTOP2_ROOT, stdio: 'inherit' }
        );
        console.log('[debug-gemini] Preload built ✓');
        return true;
    } catch (err) {
        console.error('[debug-gemini] Preload build failed:', err);
        return false;
    }
}

async function domDiagnostic() {
    if (!win || win.isDestroyed()) return;
    try {
        const diag = await win.webContents.executeJavaScript(`
            (() => {
                const accountEl = document.querySelector('a[aria-label*="@"], [aria-label*="Google 账号"], [aria-label*="Google Account"]');
                const sparkle = Array.from(document.querySelectorAll('[data-test-id="side-nav-sparkle-button"]')).map(el => ({
                    tag: el.tagName.toLowerCase(),
                    ariaLabel: el.getAttribute('aria-label'),
                    visible: el.getBoundingClientRect().width > 0
                }));
                const toggles = Array.from(document.querySelectorAll('[data-test-id="expandable-section-toggle"]')).map(el => ({
                    ariaLabel: el.getAttribute('aria-label'),
                    ariaExpanded: el.getAttribute('aria-expanded')
                }));
                const convListEls = document.querySelectorAll('conversations-list');
                const convListAll = document.querySelectorAll('conversations-list[data-test-id="all-conversations"]');
                return {
                    href: location.href,
                    title: document.title,
                    bodyTextSample: (document.body?.innerText || '').replace(/\\s+/g,' ').trim().slice(0, 200),
                    accountAriaLabel: accountEl?.getAttribute('aria-label') || null,
                    sparkleButtons: sparkle,
                    sectionToggles: toggles,
                    conversationsListCount: convListEls.length,
                    allConversationsListCount: convListAll.length,
                    appAnchorCount: document.querySelectorAll('a[href*="/app/"]').length,
                    convAnchorCount: document.querySelectorAll('a[data-test-id="conversation"]').length,
                    hasLoginGate: !!document.querySelector('a[href*="ServiceLogin"], a[href*="accounts.google.com"]')
                };
            })()
        `, true);
        console.log('[debug-gemini] DOM diagnostic:', JSON.stringify(diag, null, 2));
        fileLog(`DOM diagnostic: ${JSON.stringify(diag)}`);
    } catch (err) {
        fileLog(`DOM diagnostic error: ${err instanceof Error ? err.message : String(err)}`);
    }
}

async function runScraper() {
    if (!win || win.isDestroyed()) return;

    const config = loadConfig();
    const requestJson = JSON.stringify({
        action: 'GET_HISTORY_LIST',
        config,
        query: '',
        debugTraceId: `debug-${Date.now()}`
    });

    console.log('\n[debug-gemini] ── Running scraper ──────────────────────────');
    console.log('[debug-gemini] Page URL:', win.webContents.getURL());
    console.log('[debug-gemini] Config version:', config.version);
    fileLog(`\n[${new Date().toISOString()}] ── Running scraper ──`);
    fileLog(`Page URL: ${win.webContents.getURL()}`);
    fileLog(`Config version: ${config.version}`);

    try {
        const result = await win.webContents.executeJavaScript(`
            (() => {
                const bridge = window.chatprismGeminiHistory;
                if (!bridge || typeof bridge.request !== 'function') {
                    return { error: 'Bridge not available. Is the preload injected?' };
                }
                return bridge.request(${requestJson});
            })()
        `, true);

        console.log('[debug-gemini] Result:');
        console.log(JSON.stringify(result, null, 2));
        fileLog(`Result: ${JSON.stringify(result)}`);

        if (result?.ok && Array.isArray(result.data)) {
            console.log(`\n[debug-gemini] ✓ ${result.data.length} conversation(s) found`);
            fileLog(`✓ ${result.data.length} conversation(s) found`);
            result.data.slice(0, 5).forEach((item: { id: string; title: string }, i: number) => {
                console.log(`  [${i + 1}] ${item.title} (id: ${item.id})`);
                fileLog(`  [${i + 1}] ${item.title} (id: ${item.id})`);
            });
        } else if (result?.error) {
            console.error('[debug-gemini] ✗ Error:', result.error);
            fileLog(`✗ Error: ${result.error}`);
        } else if (!result?.ok) {
            console.error('[debug-gemini] ✗ Failed:', result?.code, result?.message);
            fileLog(`✗ Failed: ${result?.code} ${result?.message}`);
        }
    } catch (err) {
        console.error('[debug-gemini] executeJavaScript error:', err);
        fileLog(`executeJavaScript error: ${err instanceof Error ? err.message : String(err)}`);
    }

    console.log('[debug-gemini] ────────────────────────────────────────────────\n');
    fileLog('────────────────────────────────────────');
}

async function expandProbe() {
    if (!win || win.isDestroyed()) return;
    console.log('\n[debug-gemini] ── Expand probe ─────────────────────────────');
    try {
        const result = await win.webContents.executeJavaScript(`
            (async () => {
                const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
                const log = [];
                function clickByDti(dti, labelMatch) {
                    const els = Array.from(document.querySelectorAll('[data-test-id="' + dti + '"]'));
                    const target = labelMatch
                        ? els.find((e) => (e.getAttribute('aria-label') || '').includes(labelMatch))
                        : els[0];
                    if (target) { target.click(); return (target.getAttribute('aria-label') || dti); }
                    return null;
                }
                const sidebar = clickByDti('side-nav-sparkle-button');
                log.push('clicked sidebar: ' + sidebar);
                await sleep(1200);
                const recent = clickByDti('expandable-section-toggle', '最近')
                    || clickByDti('expandable-section-toggle', 'Recent');
                log.push('clicked recent: ' + recent);
                await sleep(1800);
                const anchors = Array.from(document.querySelectorAll('a[href*="/app/"]'));
                const navItems = Array.from(document.querySelectorAll('[data-test-id="conversation"]'));
                const firstItem = navItems[0];
                return {
                    log,
                    appAnchorCount: anchors.length,
                    navItemCount: navItems.length,
                    firstAnchors: anchors.slice(0, 4).map((a) => ({ href: a.getAttribute('href'), text: (a.textContent||'').replace(/\\s+/g,' ').trim().slice(0,50) })),
                    firstItemHTML: firstItem ? firstItem.outerHTML.replace(/\\s+/g,' ').slice(0, 500) : null
                };
            })()
        `, true);
        console.log('[debug-gemini] Expand result:', JSON.stringify(result, null, 2));
    } catch (err) {
        console.error('[debug-gemini] Expand probe error:', err);
    }
    console.log('[debug-gemini] ────────────────────────────────────────────────\n');
}

function createWindow() {
    if (!existsSync(PRELOAD_OUT)) {
        console.error('[debug-gemini] Preload not found:', PRELOAD_OUT);
        app.quit();
        return;
    }

    win = new BrowserWindow({
        width: 1400,
        height: 980,
        title: 'Gemini History Scraper Debug',
        webPreferences: {
            partition: PARTITION,
            preload: PRELOAD_OUT,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            backgroundThrottling: false
        }
    });

    win.webContents.openDevTools({ mode: 'detach' });

    win.webContents.on('did-finish-load', async () => {
        console.log('[debug-gemini] Page loaded:', win!.webContents.getURL());
        await new Promise((r) => setTimeout(r, 3500));
        await domDiagnostic();
        await runScraper();
    });

    win.webContents.on('before-input-event', (event, input) => {
        if ((input.meta || input.control) && input.key === 'r' && !input.shift) {
            event.preventDefault();
            console.log('[debug-gemini] Re-running scraper (Cmd/Ctrl+R)...');
            void runScraper();
        }
        if ((input.meta || input.control) && input.key === 'e' && !input.shift) {
            event.preventDefault();
            void expandProbe();
        }
    });

    console.log('[debug-gemini] Loading:', GEMINI_URL);
    void win.loadURL(GEMINI_URL);
}

function installWatchMode(): void {
    if (!watchMode) return;
    console.log('[debug-gemini] Watch mode enabled');
    const rerun = () => {
        if (buildPreload()) {
            void runScraper();
        }
    };
    watchFile(PRELOAD_SRC, { interval: 500 }, rerun);
    watchFile(SCRAPER_SRC, { interval: 500 }, rerun);
    watchFile(CONFIG_JSON, { interval: 500 }, rerun);
}

if (isDirectExecution()) {
    app.whenReady().then(() => {
        if (!buildPreload()) {
            app.quit();
            return;
        }
        createWindow();
        installWatchMode();
        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });

    app.on('window-all-closed', () => app.quit());
}
