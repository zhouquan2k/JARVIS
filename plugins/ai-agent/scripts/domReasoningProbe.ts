/**
 * 推理档位选择器观测探针 —— 复用 domChatProbe 的持久化登录 profile，
 * 只做一件事：打开站点 → 打开「推理档位」相关菜单 → dump 真实 DOM 结构，
 * 便于据实校正插件侧 domChatCore 里 chatgpt / gemini 的档位选择器（claude 已实探验证）。
 *
 * 用法：
 *   pnpm --filter @plugins/ai-agent probe:reasoning -- chatgpt
 *   pnpm --filter @plugins/ai-agent probe:reasoning -- gemini
 *
 * 复用 .dom-probe-profile/<provider>（与 probe:dom 同一份登录态）。
 * 输出：控制台打印候选触发器/菜单项报告，并把 composer 区与展开后的菜单 HTML
 *       存到 .dom-probe-out/<provider>-reasoning.html，dump 完即退出（不 keep-alive）。
 */

import { chromium } from '../../../apps/desktop2/node_modules/@playwright/test/index.mjs';
import { build } from '../../../apps/desktop2/node_modules/esbuild/lib/main.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(PLUGIN_ROOT, '../..');
const BROWSER_ENTRY = resolve(REPO_ROOT, 'plugins/ai-agent/src/preload/domChat/domChatBrowserEntry.ts');
const OUT_DIR = resolve(PLUGIN_ROOT, '.dom-probe-out');

const SITE_URLS: Record<string, string> = {
    gemini: 'https://gemini.google.com/app',
    chatgpt: 'https://chatgpt.com'
};

type Provider = 'gemini' | 'chatgpt';

function isDirectExecution(): boolean {
    const entry = process.argv[1];
    return Boolean(entry && resolve(entry) === fileURLToPath(import.meta.url));
}

function parseArgs() {
    const args = process.argv.slice(2);
    const provider = (args.find((a) => a === 'gemini' || a === 'chatgpt') ?? 'chatgpt') as Provider;
    return { provider };
}

async function bundleBrowserEntry(): Promise<string> {
    const result = await build({
        entryPoints: [BROWSER_ENTRY],
        bundle: true,
        write: false,
        format: 'iife',
        platform: 'browser',
        target: 'es2020'
    });
    return result.outputFiles[0].text;
}

function buildProbeScript(provider: Provider): string {
    return `(async () => {
        const brief = (el) => ({ tag: el.tagName.toLowerCase(), role: el.getAttribute('role'), testid: el.getAttribute('data-testid'), testId2: el.getAttribute('data-test-id'), value: el.getAttribute('value'), ariaControls: el.getAttribute('aria-controls'), ariaHasPopup: el.getAttribute('aria-haspopup'), ariaExpanded: el.getAttribute('aria-expanded'), ariaChecked: el.getAttribute('aria-checked'), thinkingBudget: el.getAttribute('data-thinking-budget'), text: (el.textContent||'').trim().slice(0,60) });
        const out = { provider: ${JSON.stringify(provider)}, href: location.href, before: {}, after: {} };

        const triggerCandidates = () => {
            const sel = ${JSON.stringify(provider)} === 'chatgpt'
                ? 'button.__composer-pill, button[aria-haspopup="menu"], [data-testid^="model-switcher"], [data-testid*="reasoning"], [data-testid*="composer"]'
                : '[data-test-id*="thinking"], [data-test-id*="budget"], ms-thinking-selector button, button[aria-haspopup], [data-test-id="bard-mode-menu-button"], gem-menu-item[value="thinking_level"]';
            return Array.from(document.querySelectorAll(sel)).map(brief);
        };
        out.before.triggers = triggerCandidates();
        out.before.menuItems = Array.from(document.querySelectorAll('[role="menuitemradio"], [data-thinking-budget], gem-menu-item')).map(brief);

        out.after.menuItems = Array.from(document.querySelectorAll('[role="menuitemradio"], [role="menuitem"], [data-thinking-budget], gem-menu-item, mat-option, [mat-menu-item]')).map(brief);
        out.overlayRoles = Array.from(document.querySelectorAll('.cdk-overlay-container [role], [class*="overlay"] [role], gem-popover [role]')).map(brief).slice(0, 60);
        const menus = Array.from(document.querySelectorAll('.cdk-overlay-container, [role="menu"], [role="listbox"], [data-radix-menu-content], .popover, .mat-mdc-menu-panel, .cdk-overlay-pane, ms-thinking-selector'));
        out.menuHtml = menus.map(m => m.outerHTML).join('\\n<!-- ===== next menu ===== -->\\n');

        const composer = ${JSON.stringify(provider)} === 'chatgpt'
            ? (document.querySelector('form') || document.querySelector('#prompt-textarea')?.closest('div'))
            : (document.querySelector('ms-thinking-selector') || document.querySelector('[data-test-id="bard-mode-menu-button"]')?.closest('div') || document.querySelector('input-area, .input-area'));
        out.composerHtml = composer ? composer.outerHTML : '(composer not found)';

        document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
        return out;
    })()`;
}

async function main() {
    const { provider } = parseArgs();
    const url = SITE_URLS[provider];
    const channel = process.env.PROBE_CHANNEL || undefined;
    const profileKey = channel ? `${provider}-${channel}` : provider;
    const userDataDir = resolve(PLUGIN_ROOT, `.dom-probe-profile/${profileKey}`);
    mkdirSync(userDataDir, { recursive: true });
    mkdirSync(OUT_DIR, { recursive: true });

    console.log(`[reasoning-probe] provider=${provider} channel=${channel ?? '(chrome-for-testing)'} headless=${process.env.PROBE_HEADLESS === '1'} profile=${userDataDir}`);
    const initScript = await bundleBrowserEntry();

    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: process.env.PROBE_HEADLESS === '1',
        channel,
        viewport: { width: 1280, height: 900 }
    });
    await context.addInitScript({ content: initScript });

    const page = context.pages()[0] ?? await context.newPage();
    page.on('pageerror', (err: unknown) => console.log('[page:error]', String(err)));
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const loginTimeoutMs = Number(process.env.PROBE_LOGIN_TIMEOUT_MS || 180_000);
    const deadline = Date.now() + loginTimeoutMs;
    let loggedIn = false;
    let warned = false;
    while (Date.now() < deadline) {
        loggedIn = await page.evaluate(
            `Boolean(window.__domChat && window.__domChat.findInput(document, ${JSON.stringify(provider)}))`
        ) as boolean;
        if (loggedIn) break;
        if (!warned) {
            console.log('[reasoning-probe] 未检测到输入框——若是登录页请在窗口完成登录（最多 180s）...');
            warned = true;
        }
        await page.waitForTimeout(1000);
    }
    if (!loggedIn) {
        const state = await page.evaluate(
            `({ href: location.href, title: document.title, bodyLen: (document.body?.innerText||'').length, bodySnippet: (document.body?.innerText||'').slice(0,200), looksLikeChallenge: /just a moment|verify you are human|cloudflare|log in|sign up/i.test(document.body?.innerText||'') })`
        ) as Record<string, unknown>;
        console.error('[reasoning-probe] 超时未检测到输入框。页面状态：', JSON.stringify(state, null, 2));
        await context.close();
        process.exit(1);
    }

    await page.waitForTimeout(1500);

    const triggerSelector = provider === 'gemini'
        ? '[data-test-id="bard-mode-menu-button"]'
        : 'button.__composer-pill[aria-haspopup="menu"]';
    try {
        const trigger = page.locator(triggerSelector).first();
        await trigger.click({ timeout: 8000 });
        await page.waitForTimeout(1200);
        console.log(`[reasoning-probe] 已 click 触发器 ${triggerSelector}`);
        if (provider === 'gemini') {
            const thinkingTrigger = page.locator('gem-menu-item[value="thinking_level"]');
            if (await thinkingTrigger.count()) {
                await thinkingTrigger.click({ timeout: 4000 });
                await page.waitForTimeout(800);
                console.log('[reasoning-probe] 已展开 Gemini 思考等级子菜单');
            }
        }
    } catch (err) {
        console.log(`[reasoning-probe] 无法 click 触发器 ${triggerSelector}: ${String(err)}`);
    }

    const report = await page.evaluate(buildProbeScript(provider)) as Record<string, unknown>;

    const htmlFile = resolve(OUT_DIR, `${provider}-reasoning.html`);
    writeFileSync(htmlFile, `<!-- composer -->\n${report.composerHtml ?? ''}\n\n<!-- menus -->\n${report.menuHtml ?? ''}\n`, 'utf8');

    const jsonFile = resolve(OUT_DIR, `${provider}-reasoning.json`);
    const { composerHtml, menuHtml, ...summary } = report as Record<string, unknown>;
    writeFileSync(jsonFile, JSON.stringify(summary, null, 2), 'utf8');

    console.log('\n========== 推理档位观测报告 ==========');
    console.log(JSON.stringify(summary, null, 2));
    console.log(`\n[reasoning-probe] 完整 HTML → ${htmlFile}`);
    console.log(`[reasoning-probe] 摘要 JSON → ${jsonFile}`);
    console.log('======================================\n');

    await context.close();
    process.exit(0);
}

if (isDirectExecution()) {
    main().catch((err) => {
        console.error('[reasoning-probe] 失败：', err);
        process.exit(1);
    });
}
