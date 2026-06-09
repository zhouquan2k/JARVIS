/**
 * DOM 实时对话抓取 —— 纯逻辑核心（无 electron / 无副作用）。
 *
 * 这是「线上 preload」「独立实时探针」「jsdom 回归单测」三者共用的单一事实源：
 * 选择器、输入注入、回复提取、生成态判断都在这里，任何修改都能被独立验证。
 */
import { extractGeminiMessageText } from '../../providers/history/gemini/geminiMessageSerializer';

export type DomChatProvider = 'chatgpt' | 'gemini';

export interface DomModelInfo {
    id: string;   // 稳定标识符（来自页面 data 属性，或由名称派生的 slug）
    name: string; // 用户可见的显示名称
}

export interface DomChatSelectors {
    /** 输入框（contenteditable 或 textarea）。 */
    input: string;
    /** 发送按钮（语言无关优先）。 */
    sendButton: string;
    /** 停止/生成中按钮（存在即代表仍在生成，含联网搜索的暂停期）。 */
    stopButton: string;
    /** 最后一条助手回复气泡。 */
    responseBubble: string;
}

export const DOM_CHAT_SELECTORS: Record<DomChatProvider, DomChatSelectors> = {
    chatgpt: {
        input: '#prompt-textarea',
        sendButton: '[data-testid="send-button"]',
        stopButton: '[data-testid="stop-button"]',
        responseBubble: '[data-message-author-role="assistant"]'
    },
    gemini: {
        input: 'rich-textarea .ql-editor[contenteditable="true"]',
        // 语言无关优先用 .send-button 类，再回退到各语言 aria-label。
        sendButton: 'button.send-button, button[aria-label="Send message"], button[aria-label*="Send" i], button[aria-label*="发送"], button[mattooltip*="Send" i]',
        stopButton: 'button.stop, button[aria-label="Stop response"], button[aria-label*="Stop" i], button[aria-label*="停止"]',
        // 与历史抓取一致的权威 assistant 选择器（GeminiHistoryConfigLoader）。
        responseBubble: '[data-test-id="model-response"], model-response'
    }
};

export function findInput(doc: Document, provider: DomChatProvider): HTMLElement | null {
    return doc.querySelector<HTMLElement>(DOM_CHAT_SELECTORS[provider].input);
}

/**
 * 往输入框写入文本。
 * - textarea：直接赋 value；
 * - contenteditable（Quill / ProseMirror）：用 execCommand('insertText') 触发 beforeinput/input，
 *   使编辑器更新内部模型并启用发送按钮（仅设 textContent 往往不被识别）。
 */
export function setInputText(inputEl: HTMLElement, prompt: string): void {
    const doc = inputEl.ownerDocument;
    const view = doc.defaultView;
    inputEl.focus();

    if (typeof HTMLTextAreaElement !== 'undefined' && inputEl instanceof HTMLTextAreaElement) {
        inputEl.value = prompt;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        return;
    }

    const selection = view?.getSelection?.();
    if (selection) {
        selection.selectAllChildren(inputEl);
        selection.deleteFromDocument();
    }

    const inserted = typeof doc.execCommand === 'function'
        ? doc.execCommand('insertText', false, prompt)
        : false;
    if (!inserted) {
        inputEl.textContent = prompt;
        inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt }));
    }
}

/** 找到「可点击」的发送按钮（同时排除 disabled / aria-disabled）。 */
export function findEnabledSendButton(doc: Document, provider: DomChatProvider): HTMLButtonElement | null {
    const btn = doc.querySelector<HTMLButtonElement>(DOM_CHAT_SELECTORS[provider].sendButton);
    if (!btn) {
        return null;
    }
    const ariaDisabled = btn.getAttribute('aria-disabled') === 'true';
    return !btn.disabled && !ariaDisabled ? btn : null;
}

/** 是否仍在生成（停止按钮存在 = 生成中，含联网搜索暂停期）。 */
export function isGenerating(doc: Document, provider: DomChatProvider): boolean {
    return Boolean(doc.querySelector(DOM_CHAT_SELECTORS[provider].stopButton));
}

/**
 * 读取最后一条助手回复的「完整快照」正文。
 * - gemini：复用历史抓取的序列化器，跳过按钮/图标/状态、剥离「Gemini 说」前缀；
 * - chatgpt：取最后一条 assistant 气泡的 .markdown（回退气泡）innerText。
 */
export function readLatestReply(doc: Document, provider: DomChatProvider): string {
    const bubbles = doc.querySelectorAll<HTMLElement>(DOM_CHAT_SELECTORS[provider].responseBubble);
    const last = bubbles.length > 0 ? bubbles[bubbles.length - 1] : null;
    if (!last) {
        return '';
    }

    if (provider === 'gemini') {
        return stripLeadingSpeakerHeading(extractGeminiMessageText(last, 'assistant'));
    }

    const content = last.querySelector<HTMLElement>('.markdown') ?? last;
    return stripLeadingSpeakerHeading((content.innerText ?? content.textContent ?? '').trim());
}

// 整行只是「Gemini 说 / ChatGPT 说 / Gemini said」之类的发言人标签（可带 markdown 标题号）。
const SPEAKER_LABEL_LINE = /^#{0,6}\s*(gemini|chatgpt)\s*(说|說|答|回复|回覆|回答|回應|said)?\s*[:：-]?\s*$/i;

/**
 * 剥离开头「发言人标签」行（尤其是被渲染成 markdown 标题的 `## Gemini 说`，否则会以超大字号显示）。
 * 只删除「整行即标签」的行，不会误删正文。
 */
export function stripLeadingSpeakerHeading(text: string): string {
    const lines = text.split('\n');
    while (lines.length > 0) {
        const head = lines[0].trim();
        if (head === '' || SPEAKER_LABEL_LINE.test(head)) {
            lines.shift();
            continue;
        }
        break;
    }
    return lines.join('\n').trim();
}

export function describePageState(doc: Document): string {
    const loc = doc.defaultView?.location;
    return `url=${loc?.href ?? '(unknown)'} readyState=${doc.readyState}`;
}

// ─── Web search toggle ────────────────────────────────────────────────────────
// 选择器经 2026-06 在已登录账号（zh-CN UI）上实时探活确认：
//
// ChatGPT: 联网开关位于 composer 「+」(composer-plus-btn) 菜单内，是一个文本含
//   「网页搜索 / Web search」的 [role="menuitemradio"]。打开 Radix 菜单和点击菜单项
//   都需要合成 pointerdown→pointerup→click（普通 .click() 无效）。开启后 composer
//   出现一个 button[data-tone="accent"] 药丸（文本含「搜索」），placeholder 变为「搜索网页」，
//   以此作为「当前是否开启」的可见判定。
// Gemini: 没有独立联网开关——Gemini 默认即以 Google 搜索接地，故 web_search 在 Gemini
//   侧为有意的 no-op（见 change group-conversation task 10.2 决策）。菜单里的 Deep Research
//   是另一套重量级深度研究模式，刻意不与 web_search 绑定。

const CHATGPT_PLUS_BTN = '[data-testid="composer-plus-btn"]';
const CHATGPT_MENU_ITEM = '[role="menuitemradio"]';
const CHATGPT_WEB_LABEL = /网页搜索|search the web|web search/i;
const CHATGPT_ACTIVE_PILL = 'form button[data-tone="accent"]';
const SEARCH_TERM = /搜索|search/i;

function firePointerClick(el: Element): void {
    const opts: PointerEventInit = { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** ChatGPT 是否处于联网开启态：composer 出现含「搜索」的 accent 药丸。 */
function chatgptWebSearchActive(doc: Document): boolean {
    const pill = doc.querySelector(CHATGPT_ACTIVE_PILL);
    if (!pill) {
        return false;
    }
    const label = `${pill.getAttribute('aria-label') ?? ''} ${pill.textContent ?? ''}`;
    return SEARCH_TERM.test(label);
}

async function setChatgptWebSearch(doc: Document, enabled: boolean): Promise<{ ok: boolean; note: string }> {
    if (chatgptWebSearchActive(doc) === enabled) {
        return { ok: true, note: 'already-correct' };
    }

    const plus = doc.querySelector<HTMLElement>(CHATGPT_PLUS_BTN);
    if (!plus) {
        return { ok: false, note: `plus button not found (${CHATGPT_PLUS_BTN})` };
    }
    firePointerClick(plus);

    // 等待 Radix 菜单渲染出「网页搜索」menuitemradio。
    let item: Element | undefined;
    for (let i = 0; i < 20 && !item; i++) {
        await delay(50);
        item = Array.from(doc.querySelectorAll(CHATGPT_MENU_ITEM)).find((el) => CHATGPT_WEB_LABEL.test(el.textContent ?? ''));
    }
    if (!item) {
        doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return { ok: false, note: 'web-search menu item not found' };
    }

    firePointerClick(item);
    await delay(150);
    // 点击 radio 后菜单通常自动关闭，保险起见再 Esc 一次。
    doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await delay(50);

    const nowActive = chatgptWebSearchActive(doc);
    if (nowActive !== enabled) {
        return { ok: false, note: `toggle-mismatch (wanted=${enabled}, got=${nowActive})` };
    }
    return { ok: true, note: enabled ? 'enabled' : 'disabled' };
}

/**
 * 切换页面内联网搜索开关到目标状态（幂等：当前态已正确则不操作）。
 * - chatgpt：经 composer「+」菜单内的「网页搜索」menuitemradio 切换（异步，等待菜单渲染）。
 * - gemini：默认即接入 Google 搜索接地，无独立开关 → no-op。
 */
export async function setWebSearchEnabled(doc: Document, provider: DomChatProvider, enabled: boolean): Promise<{ ok: boolean; note: string }> {
    if (provider === 'gemini') {
        return { ok: true, note: 'gemini-default-grounded-noop' };
    }
    return setChatgptWebSearch(doc, enabled);
}

// ─── Model picker & Reasoning effort ─────────────────────────────────────
// ChatGPT — __composer-pill 菜单里的 Thinking/Instant 是「推理档位」，不是可选模型。
//   trigger (verified 2026-06): button.__composer-pill[aria-haspopup="menu"]
//   items:   [role="menuitemradio"][data-testid^="model-switcher"]
//   Thinking: data-testid="model-switcher-gpt-5-5-thinking"
//   Instant:  data-testid="model-switcher-gpt-5-5"
//
// Gemini — Flash-Lite / Flash / Pro 是真实模型（model picker）；
//   思考等级「标准/扩展」是推理档位（需浏览器探针验证选择器后更新）。
//   model trigger (verified): [data-test-id="bard-mode-menu-button"]
//   model items:  gem-menu-item[role="menuitem"], id attr: data-mode-id
//   thinking trigger (UNVERIFIED — run probe before shipping):
//     pnpm --filter desktop2 probe:dom:electron -- gemini

const CHATGPT_PILL_BTN = 'button.__composer-pill[aria-haspopup="menu"]';
const CHATGPT_PILL_ITEM_SEL = '[role="menuitemradio"][data-testid^="model-switcher"]';
const CHATGPT_THINKING_ID = 'model-switcher-gpt-5-5-thinking';
const CHATGPT_INSTANT_ID = 'model-switcher-gpt-5-5';

const GEMINI_MODEL_BTN = '[data-test-id="bard-mode-menu-button"]';
const GEMINI_MODEL_ITEM_SEL = 'gem-menu-item[role="menuitem"]';
// Gemini 思考等级 — 选择器待验证，部署前请先运行浏览器探针确认。
const GEMINI_THINKING_BTN = '[data-test-id="bard-thinking-budget-button"], ms-thinking-selector button, [data-test-id*="thinking-budget"]';
const GEMINI_THINKING_ITEM_SEL = '[data-test-id*="thinking-budget-item"], gem-menu-item[data-thinking-budget]';
const GEMINI_THINKING_EXTENDED = 'extended';
const GEMINI_THINKING_STANDARD = 'standard';

function waitForSelector(doc: Document, selector: string, timeoutMs = 3_000): Promise<Element | null> {
    return new Promise((resolve) => {
        const deadline = Date.now() + timeoutMs;
        const tick = () => {
            const el = doc.querySelector(selector);
            if (el) { resolve(el); return; }
            if (Date.now() >= deadline) { resolve(null); return; }
            setTimeout(tick, 50);
        };
        tick();
    });
}

// 触发按钮就绪等待超时：页面刚导航完 SPA 还未水合时，按钮要数秒后才出现。
const MODEL_TRIGGER_TIMEOUT_MS = 6_000;

function logModelRead(provider: DomChatProvider, stage: string, extra?: Record<string, unknown>): void {
    const href = (() => { try { return document?.location?.href ?? ''; } catch { return ''; } })();
    console.log('[DomChatModels]', JSON.stringify({ provider, stage, href, ...extra }));
}

async function readGeminiModels(doc: Document): Promise<DomModelInfo[]> {
    const btn = (await waitForSelector(doc, GEMINI_MODEL_BTN, MODEL_TRIGGER_TIMEOUT_MS)) as HTMLElement | null;
    if (!btn) {
        logModelRead('gemini', 'trigger-missing');
        return [];
    }

    firePointerClick(btn);

    const firstItem = await waitForSelector(doc, GEMINI_MODEL_ITEM_SEL, 3_000);
    if (!firstItem) {
        logModelRead('gemini', 'items-missing');
        doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return [];
    }

    const models: DomModelInfo[] = [];
    for (const item of doc.querySelectorAll<HTMLElement>(GEMINI_MODEL_ITEM_SEL)) {
        const id = item.getAttribute('data-mode-id');
        if (!id) continue;
        const labelEl = item.querySelector('.label');
        const name = (labelEl?.textContent ?? item.textContent ?? '').trim();
        if (name && !models.some((m) => m.id === id)) {
            models.push({ id, name });
        }
    }

    doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await delay(100);
    logModelRead('gemini', 'found', { count: models.length });
    return models;
}

/**
 * 从页面模型选择器读取可用模型列表。
 * - chatgpt：__composer-pill 内容是推理档位，不是模型 → 固定返回 []（单一 'dom' 兜底）。
 * - gemini：Flash-Lite / Flash / Pro 是真实模型，动态读取。
 */
export async function readAvailableModels(doc: Document, provider: DomChatProvider): Promise<DomModelInfo[]> {
    if (provider === 'chatgpt') return [];
    try {
        if (provider === 'gemini') return await readGeminiModels(doc);
    } catch {
        // 忽略错误，返回空数组触发调用方回退
    }
    return [];
}

async function setGeminiModel(doc: Document, modelId: string): Promise<{ ok: boolean; note: string }> {
    const btn = doc.querySelector<HTMLElement>(GEMINI_MODEL_BTN);
    if (!btn) return { ok: false, note: 'model-picker-not-found' };

    firePointerClick(btn);

    const firstItem = await waitForSelector(doc, GEMINI_MODEL_ITEM_SEL, 3_000);
    if (!firstItem) {
        doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return { ok: false, note: 'picker-items-not-found' };
    }

    // 已经选中（gem-menu-item-content.selected）则关闭菜单直接返回
    const alreadySelected = doc.querySelector<HTMLElement>(
        `gem-menu-item[data-mode-id="${CSS.escape(modelId)}"] gem-menu-item-content.selected`
    );
    if (alreadySelected) {
        doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return { ok: true, note: 'already-selected' };
    }

    const target = doc.querySelector<HTMLElement>(`gem-menu-item[data-mode-id="${CSS.escape(modelId)}"]`);
    if (!target) {
        doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return { ok: false, note: `model-not-in-picker:${modelId}` };
    }

    firePointerClick(target);
    await delay(150);
    return { ok: true, note: `switched-to:${modelId}` };
}

/**
 * 在页面内切换 Gemini 模型（幂等）。ChatGPT 固定单一模型，直接返回 ok。
 */
export async function setActiveModel(
    doc: Document,
    provider: DomChatProvider,
    modelId: string
): Promise<{ ok: boolean; note: string }> {
    if (provider === 'chatgpt') return { ok: true, note: 'chatgpt-single-model-noop' };
    try {
        if (provider === 'gemini') return await setGeminiModel(doc, modelId);
    } catch (err) {
        return { ok: false, note: `error:${String(err)}` };
    }
    return { ok: false, note: 'unknown-provider' };
}

// ChatGPT 推理档位：high=true → Thinking，high=false → Instant。
// 复用已验证的 __composer-pill 选择器，仅目标 ID 不同。
async function setChatGPTReasoningEffort(doc: Document, high: boolean): Promise<{ ok: boolean; note: string }> {
    const targetId = high ? CHATGPT_THINKING_ID : CHATGPT_INSTANT_ID;
    const btn = doc.querySelector<HTMLElement>(CHATGPT_PILL_BTN);
    if (!btn) return { ok: false, note: 'reasoning-picker-not-found' };

    firePointerClick(btn);

    const firstItem = await waitForSelector(doc, CHATGPT_PILL_ITEM_SEL, 3_000);
    if (!firstItem) {
        doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return { ok: false, note: 'picker-items-not-found' };
    }

    const alreadySelected = doc.querySelector<HTMLElement>(
        `[role="menuitemradio"][data-testid="${CSS.escape(targetId)}"][aria-checked="true"]`
    );
    if (alreadySelected) {
        doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return { ok: true, note: 'already-selected' };
    }

    const target = doc.querySelector<HTMLElement>(`[role="menuitemradio"][data-testid="${CSS.escape(targetId)}"]`);
    if (!target) {
        doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return { ok: false, note: `reasoning-item-not-found:${targetId}` };
    }

    firePointerClick(target);
    await delay(150);
    return { ok: true, note: `set-reasoning:${high ? 'thinking' : 'instant'}` };
}

// Gemini 推理档位：high=true → 扩展（Extended），high=false → 标准（Standard）。
// 注意：GEMINI_THINKING_BTN / GEMINI_THINKING_ITEM_SEL 尚未经过浏览器探针验证，
// 部署前请运行：pnpm --filter desktop2 probe:dom:electron -- gemini
async function setGeminiReasoningEffort(doc: Document, high: boolean): Promise<{ ok: boolean; note: string }> {
    const btn = doc.querySelector<HTMLElement>(GEMINI_THINKING_BTN);
    if (!btn) {
        console.warn('[DomChatModels]', JSON.stringify({ stage: 'gemini-thinking-btn-missing', note: 'selector needs browser verification' }));
        return { ok: false, note: 'gemini-thinking-btn-missing' };
    }

    firePointerClick(btn);

    const firstItem = await waitForSelector(doc, GEMINI_THINKING_ITEM_SEL, 3_000);
    if (!firstItem) {
        doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return { ok: false, note: 'gemini-thinking-items-missing' };
    }

    const targetId = high ? GEMINI_THINKING_EXTENDED : GEMINI_THINKING_STANDARD;
    const alreadySelected = doc.querySelector<HTMLElement>(`[data-thinking-budget="${CSS.escape(targetId)}"][aria-checked="true"]`);
    if (alreadySelected) {
        doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return { ok: true, note: 'already-selected' };
    }

    const target = doc.querySelector<HTMLElement>(`[data-thinking-budget="${CSS.escape(targetId)}"]`);
    if (!target) {
        doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return { ok: false, note: `gemini-thinking-item-not-found:${targetId}` };
    }

    firePointerClick(target);
    await delay(150);
    return { ok: true, note: `set-reasoning:${high ? 'extended' : 'standard'}` };
}

/**
 * 在页面内切换推理档位（幂等）。失败不阻塞发送。
 * - chatgpt: high → Thinking，!high → Instant（via __composer-pill）
 * - gemini:  high → 扩展，!high → 标准（via 思考等级选择器；选择器待浏览器验证）
 */
export async function setReasoningEffort(
    doc: Document,
    provider: DomChatProvider,
    high: boolean
): Promise<{ ok: boolean; note: string }> {
    try {
        if (provider === 'chatgpt') return await setChatGPTReasoningEffort(doc, high);
        if (provider === 'gemini') return await setGeminiReasoningEffort(doc, high);
    } catch (err) {
        return { ok: false, note: `error:${String(err)}` };
    }
    return { ok: false, note: 'unknown-provider' };
}
