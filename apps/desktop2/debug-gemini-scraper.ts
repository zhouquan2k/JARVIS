/**
 * Gemini History Scraper 独立调试工具
 *
 * 用法：
 *   pnpm --filter desktop2 debug:gemini          # 单次运行
 *   pnpm --filter desktop2 debug:gemini -- --watch # 监视 preload 源码，自动重建并重新执行
 *
 * 复用 persist:chatprism-gemini 分区（与主 app 共享登录态），无需重新登录。
 * DevTools 自动打开，可实时检查 DOM。
 * 窗口内按 Cmd+R / Ctrl+R 重新执行 scraper（不重启 Electron）。
 */

import { app, BrowserWindow } from 'electron';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, watchFile } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// __dirname is apps/desktop2/dist when bundled — resolve repo paths relative to desktop2 root
const DESKTOP2_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(DESKTOP2_ROOT, '../..');

const GEMINI_URL = 'https://gemini.google.com/app';
const PARTITION = 'persist:chatprism-gemini';
const PRELOAD_OUT = resolve(DESKTOP2_ROOT, 'dist/main/main/gemini-history.preload.cjs');
const PRELOAD_SRC = resolve(DESKTOP2_ROOT, 'main/gemini-history.preload.ts');
const SCRAPER_SRC = resolve(REPO_ROOT, 'plugins/ai-agent/src/providers/history/gemini/geminiDomScraper.ts');
// Source of truth for selectors is the server-served remote config; read it directly for tight iteration
const CONFIG_JSON = resolve(REPO_ROOT, 'apps/server/src/provider-configs/gemini-history.json');
const ESBUILD_BIN = resolve(DESKTOP2_ROOT, 'node_modules/.bin/esbuild');

const watchMode = process.argv.includes('--watch');
let win: BrowserWindow | null = null;

// ── 加载配置（直接读本地 server json，改 json 重跑即可测）──────────────────────
function loadConfig() {
    const raw = readFileSync(CONFIG_JSON, 'utf8');
    return JSON.parse(raw);
}

// ── 构建 preload（用本地 esbuild 二进制，cwd=desktop2 root，alias 与 package.json 一致）──
function buildPreload(): boolean {
    try {
        console.log('[debug-gemini] Building preload...');
        execSync(
            `"${ESBUILD_BIN}" main/gemini-history.preload.ts --bundle --platform=node --format=cjs --target=node18 --outfile=dist/main/main/gemini-history.preload.cjs --external:electron --alias:@packages/core=../../packages/core --alias:@packages/ui=../../packages/ui`,
            { cwd: DESKTOP2_ROOT, stdio: 'inherit' }
        );
        console.log('[debug-gemini] Preload built ✓');
        return true;
    } catch (err) {
        console.error('[debug-gemini] Preload build failed:', err);
        return false;
    }
}

// ── 执行 scraper ─────────────────────────────────────────────────────────────
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

        if (result?.ok && Array.isArray(result.data)) {
            console.log(`\n[debug-gemini] ✓ ${result.data.length} conversation(s) found`);
            result.data.slice(0, 5).forEach((item: { id: string; title: string }, i: number) => {
                console.log(`  [${i + 1}] ${item.title} (id: ${item.id})`);
            });
        } else if (result?.error) {
            console.error('[debug-gemini] ✗ Error:', result.error);
        } else if (!result?.ok) {
            console.error('[debug-gemini] ✗ Failed:', result?.code, result?.message);
        }
    } catch (err) {
        console.error('[debug-gemini] executeJavaScript error:', err);
    }

    console.log('[debug-gemini] ────────────────────────────────────────────────\n');
}

// ── 展开探针：点击"打开边栏" + 展开"最近"，观察是否出现会话链接 ──────────────
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
                // 1. 打开边栏
                const sidebar = clickByDti('side-nav-sparkle-button');
                log.push('clicked sidebar: ' + sidebar);
                await sleep(1200);
                // 2. 展开"最近"
                const recent = clickByDti('expandable-section-toggle', '最近')
                    || clickByDti('expandable-section-toggle', 'Recent');
                log.push('clicked recent: ' + recent);
                await sleep(1800);
                // 3. 探测链接
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

// ── 创建窗口 ──────────────────────────────────────────────────────────────────
function createWindow() {
    if (!existsSync(PRELOAD_OUT)) {
        console.error('[debug-gemini] Preload not found:', PRELOAD_OUT);
        app.quit();
        return;
    }

    win = new BrowserWindow({
        width: 1280,
        height: 900,
        title: 'Gemini Scraper Debug',
        webPreferences: {
            partition: PARTITION,
            preload: PRELOAD_OUT,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    // 自动打开 DevTools（detached，避免占用视口宽度触发移动端布局）
    win.webContents.openDevTools({ mode: 'detach' });

    // 转发 Gemini preload 的 console 日志
    win.webContents.on('console-message', (_e, level, msg) => {
        if (msg.includes('[ChatPrism][GeminiHistory]')) {
            const prefix = ['[verbose]', '[info]', '[warn]', '[error]'][level] || '[log]';
            console.log(`[GeminiWindow]${prefix}`, msg);
        }
    });

    win.webContents.on('did-finish-load', async () => {
        console.log('[debug-gemini] Page loaded:', win!.webContents.getURL());
        // 等待 Angular 渲染
        await new Promise((r) => setTimeout(r, 3500));
        await runScraper();
    });

    win.loadURL(GEMINI_URL);
    console.log('[debug-gemini] Loading', GEMINI_URL);

    // Cmd+R / Ctrl+R 重新执行（不刷新页面）
    win.webContents.on('before-input-event', (event, input) => {
        if ((input.meta || input.control) && input.key === 'r' && !input.shift) {
            event.preventDefault();
            console.log('[debug-gemini] Re-running scraper (Cmd/Ctrl+R)...');
            void runScraper();
        }
        // Cmd+Shift+R 强制刷新页面并重新执行
        if ((input.meta || input.control) && input.key === 'r' && input.shift) {
            console.log('[debug-gemini] Reloading page (Cmd/Ctrl+Shift+R)...');
        }
    });
}

// ── Watch 模式：监视 preload 源码变化 ─────────────────────────────────────────
function startWatch() {
    console.log('[debug-gemini] Watch mode: monitoring preload source for changes...');

    let rebuildTimer: ReturnType<typeof setTimeout> | null = null;

    function scheduleRebuild() {
        if (rebuildTimer) clearTimeout(rebuildTimer);
        rebuildTimer = setTimeout(async () => {
            const ok = buildPreload();
            if (ok && win && !win.isDestroyed()) {
                console.log('[debug-gemini] Reloading page after preload rebuild...');
                win.webContents.reloadIgnoringCache();
            }
        }, 300);
    }

    // Watch the preload source and the scraper source
    const watchPaths = [
        PRELOAD_SRC,
        SCRAPER_SRC,
        CONFIG_JSON
    ];

    watchPaths.forEach((p) => {
        if (existsSync(p)) {
            watchFile(p, { interval: 500 }, scheduleRebuild);
            console.log('[debug-gemini]  watching:', p);
        }
    });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
    // 先构建一次 preload
    buildPreload();

    if (watchMode) {
        startWatch();
    }

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => app.quit());
