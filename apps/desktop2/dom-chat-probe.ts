/**
 * DOM 实时对话抓取 —— 独立实时探针（Playwright，独立持久化 profile）
 *
 * 目的：脱离整个 JARVIS（无需登录主 app / 重启 / 点 UI），用紧凑循环验证
 * 「与线上 preload 完全相同」的注入 + 提取 + 结束检测逻辑（plugins/ai-agent/src/preload/domChat/*）。
 *
 * 用法：
 *   pnpm --filter desktop2 probe:dom -- gemini "美国第二大城市是哪里"
 *   pnpm --filter desktop2 probe:dom -- chatgpt "印度的首都" --dump
 *
 * 首次运行请在弹出的窗口里登录（profile 保存在 .dom-probe-profile/<provider>，长期保留）。
 * --dump  抓取结束后把最后一条回复气泡的 outerHTML 存到 domChat fixtures，便于补回归用例。
 */
import { chromium, type BrowserContext } from '@playwright/test';
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DESKTOP2_ROOT = __dirname;
const REPO_ROOT = resolve(DESKTOP2_ROOT, '../..');
const BROWSER_ENTRY = resolve(REPO_ROOT, 'plugins/ai-agent/src/preload/domChat/domChatBrowserEntry.ts');
const FIXTURE_DIR = resolve(REPO_ROOT, 'plugins/ai-agent/src/preload/domChat/fixtures');

const SITE_URLS: Record<string, string> = {
    gemini: 'https://gemini.google.com/app',
    chatgpt: 'https://chatgpt.com',
    claude: 'https://claude.ai/new'
};

type Provider = 'gemini' | 'chatgpt' | 'claude';

function parseArgs() {
    const args = process.argv.slice(2);
    const provider = (args.find((a) => a === 'gemini' || a === 'chatgpt' || a === 'claude') ?? 'gemini') as Provider;
    const dump = args.includes('--dump');
    const prompt = args.find((a) => !a.startsWith('--') && a !== provider) ?? '美国第二大城市是哪里？';
    return { provider, prompt, dump };
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

async function waitForLogin(context: BrowserContext, provider: Provider, page: import('@playwright/test').Page): Promise<boolean> {
    const deadline = Date.now() + 300_000;
    let warned = false;
    while (Date.now() < deadline) {
        // 用字符串 evaluate，避免 tsx 给内联函数注入 __name 辅助导致浏览器侧 ReferenceError。
        const hasInput = await page.evaluate(
            `Boolean(window.__domChat && window.__domChat.findInput(document, ${JSON.stringify(provider)}))`
        ) as boolean;
        if (hasInput) return true;
        if (!warned) {
            console.log('[probe] 未检测到输入框——若是登录页，请在弹出的窗口完成登录（最多等待 180s）...');
            warned = true;
        }
        await page.waitForTimeout(1000);
    }
    return false;
}

async function main() {
    const { provider, prompt, dump } = parseArgs();
    const url = SITE_URLS[provider];
    const userDataDir = resolve(DESKTOP2_ROOT, `.dom-probe-profile/${provider}`);
    mkdirSync(userDataDir, { recursive: true });

    console.log(`[probe] provider=${provider} prompt=${JSON.stringify(prompt)} profile=${userDataDir}`);
    const initScript = await bundleBrowserEntry();

    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        channel: process.env.PROBE_CHANNEL || undefined,
        viewport: { width: 1280, height: 900 }
    });
    await context.addInitScript({ content: initScript });

    const page = context.pages()[0] ?? await context.newPage();
    // 仅转发页面侧错误（过滤站点自身的海量分析/调试噪声）。
    page.on('console', (msg) => {
        if (msg.type() === 'error') console.log('[page:error]', msg.text());
    });
    page.on('pageerror', (err) => console.log('[page:error]', String(err)));
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const loggedIn = await waitForLogin(context, provider, page);
    if (!loggedIn) {
        console.error('[probe] 超时仍未检测到输入框，退出。');
        await context.close();
        process.exit(1);
    }

    const start = Date.now();

    // 第一步：注入（字符串 evaluate，返回结果便于观测注入是否成功）。
    console.log('[probe] 注入 prompt...');
    const inject = await page.evaluate(
        `window.__domChat.injectPrompt(document, ${JSON.stringify(provider)}, ${JSON.stringify(prompt)})`
    ) as { ok: boolean; stage?: string; message?: string };
    console.log('[probe] inject result:', JSON.stringify(inject));
    if (!inject.ok) {
        console.error(`[probe] 注入失败：${inject.stage} — ${inject.message}`);
        console.log('[probe] 保持窗口打开以便检查 DOM；按 Ctrl+C 退出。');
        await new Promise(() => { /* keep alive */ });
        return;
    }

    // 第二步：观察（exposeFunction 回调 + 启动观察循环）。
    console.log('[probe] 已发送，开始观察回复...');
    const result = await new Promise<{ text: string; reason: string }>((resolvePromise) => {
        let settled = false;
        const onSnapshot = (text: string) => {
            const t = Date.now() - start;
            const preview = text.length > 80 ? `${text.slice(0, 40)}…${text.slice(-30)}` : text;
            console.log(`[probe +${t}ms] snapshot len=${text.length} :: ${preview.replace(/\n/g, '⏎')}`);
        };
        const onDone = (text: string, reason: string) => {
            if (settled) return;
            settled = true;
            resolvePromise({ text, reason });
        };

        Promise.all([
            context.exposeFunction('__probeSnapshot', onSnapshot),
            context.exposeFunction('__probeDone', onDone)
        ]).then(() =>
            page.evaluate(`window.__domChatObserve(${JSON.stringify(provider)})`)
        ).catch((err) => onDone('', `evaluate-error: ${String(err)}`));
    });

    console.log('\n========== 最终结果 ==========');
    console.log(`reason=${result.reason} elapsed=${Date.now() - start}ms len=${result.text.length}`);
    console.log('------------------------------');
    console.log(result.text || '(空)');
    console.log('==============================\n');

    if (dump) {
        const sel = provider === 'gemini'
            ? '[data-test-id="model-response"], model-response'
            : provider === 'claude'
                ? '[data-testid="message-content"]'
                : '[data-message-author-role="assistant"]';
        const html = await page.evaluate(
            `(() => { const els = document.querySelectorAll(${JSON.stringify(sel)}); return els.length ? els[els.length - 1].outerHTML : ''; })()`
        ) as string;
        mkdirSync(FIXTURE_DIR, { recursive: true });
        const file = resolve(FIXTURE_DIR, `${provider}-latest-bubble.html`);
        writeFileSync(file, html, 'utf8');
        console.log(`[probe] 已保存真实气泡 DOM 到 ${file}（可用于回归 fixture）`);
    }

    console.log('[probe] 保持窗口打开以便检查 DOM；按 Ctrl+C 退出。');
    await new Promise(() => { /* keep alive until Ctrl+C */ });
}

main().catch((err) => {
    console.error('[probe] 失败：', err);
    process.exit(1);
});
