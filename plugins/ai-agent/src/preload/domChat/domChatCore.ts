/**
 * DOM 实时对话抓取 —— 纯逻辑核心（无 electron / 无副作用）。
 *
 * 这是「线上 preload」「独立实时探针」「jsdom 回归单测」三者共用的单一事实源：
 * 选择器、输入注入、回复提取、生成态判断都在这里，任何修改都能被独立验证。
 */
import { extractGeminiMessageText, serializeDomToMarkdown } from '../../providers/history/gemini/geminiMessageSerializer';
import type { ReasoningEffort } from '../../interfaces/IModelProvider';

export type { ReasoningEffort };

export type DomChatProvider = 'chatgpt' | 'gemini' | 'claude';

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
    },
    // Claude.ai 选择器 — 经浏览器实探（2026-06）验证：
    //   input:          data-testid="chat-input"（tiptap ProseMirror contenteditable）
    //   sendButton:     aria-label="Send message"（有文字时出现在 fieldset）
    //   stopButton:     aria-label="Stop response" + [data-is-streaming="true"] 双保险
    //                   （Stop response 按钮生成中存在；data-is-streaming="true" 作为回退）
    //   responseBubble: [data-is-streaming]（每条 assistant 消息一个容器，值 true/false）
    claude: {
        input: '[data-testid="chat-input"]',
        sendButton: 'button[aria-label="Send message"]',
        stopButton: 'button[aria-label="Stop response"], [data-is-streaming="true"]',
        responseBubble: '[data-is-streaming]'
    }
};

export function findInput(doc: Document, provider: DomChatProvider): HTMLElement | null {
    return doc.querySelector<HTMLElement>(DOM_CHAT_SELECTORS[provider].input);
}

/**
 * 往输入框写入文本。
 * - textarea：直接赋 value；
 * - contenteditable（ProseMirror/tiptap）：
 *   selectAll → delete → insertText，纯用 execCommand，避免 Electron 隔离上下文
 *   中 window.getSelection() 跨 world 边界失效导致 insertText 前无有效选区的问题。
 */
export function setInputText(inputEl: HTMLElement, prompt: string): void {
    const doc = inputEl.ownerDocument;
    inputEl.focus();

    if (typeof HTMLTextAreaElement !== 'undefined' && inputEl instanceof HTMLTextAreaElement) {
        inputEl.value = prompt;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        return;
    }

    // ContentEditable（ProseMirror/tiptap/Quill）：
    // 1. execCommand('selectAll') 选中现有内容
    // 2. execCommand('delete') 清空（比 deleteFromDocument 更兼容隔离上下文）
    // 3. 逐行 insertText + 行间 insertLineBreak 写入新内容并触发编辑器内部状态更新
    if (typeof doc.execCommand === 'function') {
        doc.execCommand('selectAll');
        doc.execCommand('delete');
        const inserted = insertContentEditableText(doc, prompt);
        if (inserted) return;
    }

    // 兜底：直接设 textContent + input 事件（普通 contenteditable 有效，tiptap 可能失效）
    inputEl.textContent = prompt;
    inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt }));
}

/**
 * 往 contenteditable 写入（可能多行的）文本。
 * 单行：等价一次 insertText（与历史行为一致，零回归）。
 * 多行：按 `\n` 切分，逐行 insertText，行间用 insertLineBreak（软换行 `<br>`，等价 Shift+Enter）。
 *
 * 为什么必须是 insertLineBreak 而非 insertParagraph 或单次含 `\n` 的 insertText：
 *   Gemini 的 Quill（.ql-editor）在异步 reconcile 时会丢弃「除第一个块以外」所有块级元素的正文。
 *   - 单次 insertText 含 `\n` → 浏览器把 `\n` 转成多个块 → 只剩首行（线上实测）。
 *   - 逐行 + insertParagraph → 同样产生多个块 → 只剩首行（线上实测）。
 *   - 逐行 + insertLineBreak → 全部留在同一个块内的软换行 → Quill 完整保留（线上实测）。
 *   ChatGPT 的 ProseMirror 把 insertLineBreak 当 Shift+Enter 的硬换行处理，正文同样完整。
 *   （验证脚本：apps/desktop2 下对真实 gemini.google.com 注入回读对比 paragraph/single/linebreak。）
 * 返回是否成功（任一关键 execCommand 失败即 false，触发上层 textContent 兜底）。
 */
function insertContentEditableText(doc: Document, prompt: string): boolean {
    const lines = prompt.split('\n');
    let ok = true;
    lines.forEach((line, index) => {
        if (index > 0) {
            // 空行（连续 `\n\n`）也保留为一个软换行，维持段落间距。
            ok = doc.execCommand('insertLineBreak') && ok;
        }
        if (line !== '') {
            ok = doc.execCommand('insertText', false, line) && ok;
        }
    });
    return ok;
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

    if (provider === 'claude') {
        const content = last.querySelector<HTMLElement>('.font-claude-response') ?? last;
        return stripLeadingSpeakerHeading(extractClaudeMessageText(content));
    }

    const content = last.querySelector<HTMLElement>('.markdown') ?? last;
    // 用 HTML→Markdown 序列化器还原标题/列表/代码块/表格等结构，
    // 取代会丢失 markdown 语法的 innerText（与 group 模式回答格式丢失问题对应）。
    return stripLeadingSpeakerHeading(serializeDomToMarkdown(content));
}

/**
 * 当前页面上「助手回复气泡」的数量。
 * 用于追问轮的基线锚点：发送前记录数量，只有当出现「新气泡」（数量增加）后才认为是本轮回答，
 * 从而避免把上一轮旧气泡的重渲染（序列化漂移）误当成新回复发出（ChatGPT 偶现旧答案闪现的根因）。
 */
export function countReplyBubbles(doc: Document, provider: DomChatProvider): number {
    return doc.querySelectorAll(DOM_CHAT_SELECTORS[provider].responseBubble).length;
}

/**
 * Claude.ai 正文文本提取：
 * - 仅取 .standard-markdown / .progressive-markdown 正文块，跳过联网搜索脚手架；
 * - 移除引用 chip（a[class*="group/tag"]）和无障碍隐藏元素，避免「来源1 来源2」混入正文；
 * - 无正文块时兜底序列化整个容器（类名变更 / 简化结构 / fallback 气泡），不返回空。
 */
function extractClaudeMessageText(container: HTMLElement): string {
    const blocks = container.querySelectorAll<HTMLElement>('.standard-markdown, .progressive-markdown');
    // 无正式正文块时（类名变更 / 简化结构 / fallback 气泡）兜底序列化整个容器，
    // 而非返回空——保证格式与内容都不丢，同样剔除引用 chip 与无障碍隐藏元素。
    const sources = blocks.length > 0 ? Array.from(blocks) : [container];
    return sources
        .map((block) => {
            const clone = block.cloneNode(true) as HTMLElement;
            clone.querySelectorAll<Element>('a[class*="group/tag"]').forEach((el) => el.remove());
            clone.querySelectorAll<Element>('.sr-only').forEach((el) => el.remove());
            // 序列化保留 markdown 结构（标题/列表/代码块/表格），取代丢格式的 innerText。
            return serializeDomToMarkdown(clone);
        })
        .filter(Boolean)
        .join('\n\n')
        .trim();
}

// 整行只是「Gemini 说 / ChatGPT 说 / Claude 说」之类的发言人标签（可带 markdown 标题号）。
const SPEAKER_LABEL_LINE = /^#{0,6}\s*(gemini|chatgpt|claude)\s*(说|說|答|回复|回覆|回答|回應|said)?\s*[:：-]?\s*$/i;

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

export interface LatestReplyNodeDump {
    found: boolean;
    bubbleCount: number;
    containerSelector: string;
    /** readLatestReply 实际提取到的文本长度（= 当前发给上层的内容）。 */
    extractedTextLength: number;
    /** 命中节点 innerText 长度（提取前的「页面可见文本」基准）。 */
    bubbleInnerTextLength: number;
    /** 内容容器（如 .font-claude-response / .markdown）innerText 长度。 */
    contentInnerTextLength: number;
    outerHTMLLength: number;
    /** 命中节点完整 outerHTML（截断到 maxHtml，用于和 DOM 窗口逐段比对漏抓位置）。 */
    outerHTML: string;
}

/**
 * 阶段一诊断：dump「最后一条助手回复」命中节点的结构与各层文本长度，
 * 用于对比 readLatestReply 提取结果与页面真实内容，定位 innerText 漏抓（折叠块 / 代码 / 多容器 / artifact）。
 * 纯只读，不改变任何抓取行为。
 */
export function describeLatestReplyNode(doc: Document, provider: DomChatProvider, maxHtml = 40_000): LatestReplyNodeDump {
    const selector = DOM_CHAT_SELECTORS[provider].responseBubble;
    const bubbles = doc.querySelectorAll<HTMLElement>(selector);
    const last = bubbles.length > 0 ? bubbles[bubbles.length - 1] : null;
    const contentSelector = provider === 'claude' ? '.font-claude-response' : provider === 'chatgpt' ? '.markdown' : '';
    const contentEl = last && contentSelector ? last.querySelector<HTMLElement>(contentSelector) : null;
    const outerHTML = last?.outerHTML ?? '';
    return {
        found: Boolean(last),
        bubbleCount: bubbles.length,
        containerSelector: selector,
        extractedTextLength: readLatestReply(doc, provider).length,
        bubbleInnerTextLength: (last?.innerText ?? last?.textContent ?? '').length,
        contentInnerTextLength: (contentEl?.innerText ?? contentEl?.textContent ?? '').length,
        outerHTMLLength: outerHTML.length,
        outerHTML: outerHTML.slice(0, maxHtml)
    };
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
    if (provider === 'claude') {
        // Claude.ai 联网搜索为 project/conversation 级别控制，无 composer 开关 → no-op。
        return { ok: true, note: 'claude-no-composer-web-search-noop' };
    }
    return setChatgptWebSearch(doc, enabled);
}

// ─── Model picker & Reasoning effort ─────────────────────────────────────
// ChatGPT — __composer-pill 菜单（浏览器实探 2026-06 验证）：
//   trigger:            button.__composer-pill[aria-haspopup="menu"]
//   reasoning items:    顶层菜单中的 [role="menuitemradio"]，当前可见档位为「极速 / 均衡 / 高级」
//   model submenu:      顶层 [role="menuitem"][aria-haspopup="menu"]（当前可见入口如「GPT-5.5」）
//   model items:        子菜单中的 [role="menuitemradio"]，当前可见项如「5.5 / 5.4 / 5.3 / o3」
//
// Gemini — model 菜单与「思考等级」子菜单分离（浏览器实探 2026-06 验证）：
//   model/mode trigger: [data-test-id="bard-mode-menu-button"]
//   top-level items:    gem-menu-item[role="menuitem"]，模型项带 data-mode-id
//   reasoning trigger:  gem-menu-item[value="thinking_level"]（同一菜单内的子菜单入口）
//   reasoning options:  子菜单中的 gem-menu-item[role="menuitem"]，当前可见档位为「标准 / 扩展」
//   model/mode trigger (verified): [data-test-id="bard-mode-menu-button"]
//   menu (verified): [data-test-id="gem-mode-menu"][role="menu"]
//   items (verified): gem-menu-item[role="menuitem"]，data-mode-id / data-test-id="bard-mode-option-<id>"
//     选中项带 class="selected"（元素自身或内部 gem-menu-item-content）；名称在 .label。

const CHATGPT_PILL_BTN = 'button.__composer-pill[aria-haspopup="menu"]';
const CHATGPT_ROOT_MENU_ITEM_SEL = '[role="menuitemradio"], [role="menuitem"][aria-haspopup="menu"]';
const CHATGPT_MODEL_TRIGGER_SEL = '[role="menuitem"][aria-haspopup="menu"]';
const CHATGPT_MODEL_ITEM_SEL = '[role="menuitemradio"]';
const CHATGPT_REASONING_LABELS = {
    low: ['极速', 'Fast'],
    medium: ['均衡', 'Balanced'],
    high: ['高级', 'Thinking', 'Advanced']
} as const;

const GEMINI_MODEL_BTN = '[data-test-id="bard-mode-menu-button"]';
const GEMINI_MODEL_ITEM_SEL = 'gem-menu-item[role="menuitem"]';
const GEMINI_REASONING_TRIGGER = 'gem-menu-item[value="thinking_level"]';
const GEMINI_REASONING_STANDARD_LABEL = '标准';
const GEMINI_REASONING_EXTENDED_LABEL = '扩展';

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

function closeChatGptMenus(doc: Document): void {
    doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

function getChatGptItemLabel(el: Element | null): string {
    return (el?.textContent ?? '').trim().replace(/\s+/g, ' ');
}

function getChatGptPillLabel(doc: Document): string {
    return getChatGptItemLabel(doc.querySelector(CHATGPT_PILL_BTN));
}

function isChatGptSelectedItem(el: Element | null): boolean {
    return el?.getAttribute('aria-checked') === 'true';
}

function getChatGptReasoningLabels(effort: ReasoningEffort): readonly string[] {
    return CHATGPT_REASONING_LABELS[effort];
}

function getChatGptReasoningToken(effort: ReasoningEffort): 'fast' | 'balanced' | 'advanced' {
    if (effort === 'low') return 'fast';
    if (effort === 'medium') return 'balanced';
    return 'advanced';
}

function getChatGptReasoningIndex(effort: ReasoningEffort): number {
    if (effort === 'low') return 0;
    if (effort === 'medium') return 1;
    return 2;
}

function isChatGptReasoningLabel(label: string): boolean {
    const reasoningLabels = Object.values(CHATGPT_REASONING_LABELS) as ReadonlyArray<readonly string[]>;
    return reasoningLabels.some((labels) => labels.includes(label));
}

function chatGptModelLabelToId(label: string): string {
    const normalized = label.trim();
    return /^\d/.test(normalized) ? `gpt-${normalized}` : normalized.toLowerCase();
}

function chatGptModelLabelToName(label: string): string {
    const normalized = label.trim();
    return /^\d/.test(normalized) ? `GPT-${normalized}` : normalized;
}

function chatGptModelMatches(label: string, modelId: string): boolean {
    return label === modelId
        || chatGptModelLabelToId(label) === modelId
        || chatGptModelLabelToName(label) === modelId;
}

function getChatGptTopLevelReasoningItems(doc: Document): HTMLElement[] {
    const items = Array.from(doc.querySelectorAll<HTMLElement>(CHATGPT_ROOT_MENU_ITEM_SEL));
    const reasoningItems: HTMLElement[] = [];
    for (const item of items) {
        if (item.getAttribute('aria-haspopup') === 'menu') break;
        if (item.getAttribute('role') === 'menuitemradio') {
            reasoningItems.push(item);
        }
    }
    return reasoningItems;
}

function findChatGptReasoningItem(doc: Document, effort: ReasoningEffort): HTMLElement | null {
    const labels = getChatGptReasoningLabels(effort);
    const reasoningItems = getChatGptTopLevelReasoningItems(doc);
    return reasoningItems.find((el) => labels.includes(getChatGptItemLabel(el)))
        ?? reasoningItems[getChatGptReasoningIndex(effort)]
        ?? null;
}

async function ensureChatGptPillMenuOpen(doc: Document): Promise<{
    btn: HTMLElement | null;
    firstItem: Element | null;
}> {
    // 使用 waitForSelector 而非同步 querySelector：group 模式下先调 setModel 后调 setReasoningEffort
    // 时，ChatGPT 模型切换动画可能短暂移除 pill 按钮，同步查询会立即返回 null 导致设档失败。
    // 使用较短的超时（2s）：足够覆盖 UI 过渡动画（通常 < 500ms），且不拖累"按钮完全缺失"场景。
    const btn = (await waitForSelector(doc, CHATGPT_PILL_BTN, 2_000)) as HTMLElement | null;
    if (!btn) return { btn: null, firstItem: null };

    const firstExistingItem = doc.querySelector(CHATGPT_ROOT_MENU_ITEM_SEL);
    if (firstExistingItem) return { btn, firstItem: firstExistingItem };

    const firstItem = await openMenuRobust(btn, doc, CHATGPT_ROOT_MENU_ITEM_SEL, 3_000);
    return { btn, firstItem };
}

function getChatGptModelMenuItemSelector(trigger: Element): string {
    const controls = trigger.getAttribute('aria-controls');
    if (!controls) return CHATGPT_MODEL_ITEM_SEL;
    return `#${CSS.escape(controls)} ${CHATGPT_MODEL_ITEM_SEL}`;
}

async function ensureChatGptModelMenuOpen(doc: Document): Promise<{
    trigger: HTMLElement | null;
    submenuSelector: string;
    firstItem: Element | null;
}> {
    const trigger = doc.querySelector<HTMLElement>(CHATGPT_MODEL_TRIGGER_SEL);
    if (!trigger) return { trigger: null, submenuSelector: '', firstItem: null };

    const submenuSelector = getChatGptModelMenuItemSelector(trigger);
    const firstExistingItem = Array.from(doc.querySelectorAll<HTMLElement>(submenuSelector))
        .find((el) => !isChatGptReasoningLabel(getChatGptItemLabel(el)));
    if (firstExistingItem) {
        return { trigger, submenuSelector, firstItem: firstExistingItem };
    }

    const firstItem = await openMenuRobust(trigger, doc, submenuSelector, 2_000);
    return { trigger, submenuSelector, firstItem };
}

async function verifyChatGptReasoningSelected(doc: Document, effort: ReasoningEffort): Promise<boolean> {
    const targetLabels = getChatGptReasoningLabels(effort);
    const buttonLabel = await waitForChatGptPillLabel(doc, targetLabels);
    if (targetLabels.includes(buttonLabel)) {
        closeChatGptMenus(doc);
        return true;
    }

    const { firstItem } = await ensureChatGptPillMenuOpen(doc);
    if (!firstItem) return false;
    const target = findChatGptReasoningItem(doc, effort);
    const selected = isChatGptSelectedItem(target);
    closeChatGptMenus(doc);
    return selected;
}

async function waitForChatGptPillLabel(doc: Document, targetLabels: readonly string[], timeoutMs = 1_200): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const buttonLabel = getChatGptPillLabel(doc);
        if (targetLabels.includes(buttonLabel)) return buttonLabel;
        await delay(50);
    }
    return getChatGptPillLabel(doc);
}

async function verifyChatGptModelSelected(doc: Document, modelId: string): Promise<boolean> {
    const { firstItem } = await ensureChatGptPillMenuOpen(doc);
    if (!firstItem) return false;
    const { firstItem: submenuFirst, submenuSelector } = await ensureChatGptModelMenuOpen(doc);
    if (!submenuFirst) {
        closeChatGptMenus(doc);
        return false;
    }
    const target = Array.from(doc.querySelectorAll<HTMLElement>(submenuSelector))
        .find((el) => chatGptModelMatches(getChatGptItemLabel(el), modelId));
    const selected = isChatGptSelectedItem(target ?? null);
    closeChatGptMenus(doc);
    return selected;
}

function isGeminiSelectedItem(el: Element | null): boolean {
    if (!el) return false;
    return el.classList.contains('selected')
        || Boolean(el.querySelector('gem-menu-item-content.selected'))
        || Boolean(el.querySelector('gem-icon[aria-label="Selected"], gem-icon[aria-label="已选中"]'));
}

function isGeminiDisabledItem(el: Element | null): boolean {
    if (!el) return false;
    return el.getAttribute('aria-disabled') === 'true'
        || el.classList.contains('disabled')
        || Boolean(el.querySelector('gem-menu-item-content.disabled'));
}

function getGeminiItemLabel(el: Element | null): string {
    return (el?.querySelector('.label')?.textContent ?? el?.textContent ?? '').trim();
}

function closeGeminiMenus(doc: Document): void {
    doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

async function ensureGeminiModeMenuOpen(doc: Document): Promise<{ btn: HTMLElement | null; firstItem: Element | null }> {
    const btn = doc.querySelector<HTMLElement>(GEMINI_MODEL_BTN);
    if (!btn) return { btn: null, firstItem: null };

    const firstExistingItem = doc.querySelector(GEMINI_MODEL_ITEM_SEL);
    if (firstExistingItem) return { btn, firstItem: firstExistingItem };

    const firstItem = await openMenuRobust(btn, doc, GEMINI_MODEL_ITEM_SEL, 3_000);
    return { btn, firstItem };
}

function getGeminiReasoningMenuItemSelector(trigger: Element): string {
    const controls = trigger.getAttribute('aria-controls');
    if (controls) {
        return `#${CSS.escape(controls)} gem-menu-item[role="menuitem"]`;
    }
    return `${GEMINI_REASONING_TRIGGER} gem-menu-item[role="menuitem"]`;
}

async function ensureGeminiReasoningMenuOpen(doc: Document): Promise<{
    trigger: HTMLElement | null;
    submenuSelector: string;
    firstItem: Element | null;
}> {
    const trigger = doc.querySelector<HTMLElement>(GEMINI_REASONING_TRIGGER);
    if (!trigger) {
        return { trigger: null, submenuSelector: '', firstItem: null };
    }

    const submenuSelector = getGeminiReasoningMenuItemSelector(trigger);
    const firstExistingItem = doc.querySelector(submenuSelector);
    if (firstExistingItem) {
        return { trigger, submenuSelector, firstItem: firstExistingItem };
    }

    const firstItem = await openMenuRobust(trigger, doc, submenuSelector, 2_000);
    return { trigger, submenuSelector, firstItem };
}

async function verifyGeminiModelSelected(doc: Document, modelId: string): Promise<boolean> {
    const { firstItem } = await ensureGeminiModeMenuOpen(doc);
    if (!firstItem) return false;
    const target = doc.querySelector<HTMLElement>(`gem-menu-item[data-mode-id="${CSS.escape(modelId)}"]`);
    const selected = isGeminiSelectedItem(target);
    closeGeminiMenus(doc);
    return selected;
}

async function verifyGeminiReasoningSelected(doc: Document, targetLabel: string): Promise<boolean> {
    const { firstItem } = await ensureGeminiModeMenuOpen(doc);
    if (!firstItem) return false;
    const { firstItem: submenuFirst, submenuSelector } = await ensureGeminiReasoningMenuOpen(doc);
    if (!submenuFirst) {
        closeGeminiMenus(doc);
        return false;
    }
    const target = Array.from(doc.querySelectorAll<HTMLElement>(submenuSelector))
        .find((el) => getGeminiItemLabel(el) === targetLabel);
    const selected = isGeminiSelectedItem(target ?? null);
    closeGeminiMenus(doc);
    return selected;
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

async function readChatGptModels(doc: Document): Promise<DomModelInfo[]> {
    const btn = (await waitForSelector(doc, CHATGPT_PILL_BTN, MODEL_TRIGGER_TIMEOUT_MS)) as HTMLElement | null;
    if (!btn) {
        logModelRead('chatgpt', 'trigger-missing');
        return [];
    }

    const firstItem = await openMenuRobust(btn, doc, CHATGPT_ROOT_MENU_ITEM_SEL, 3_000);
    if (!firstItem) {
        logModelRead('chatgpt', 'items-missing');
        closeChatGptMenus(doc);
        return [];
    }

    const { trigger, submenuSelector, firstItem: submenuFirst } = await ensureChatGptModelMenuOpen(doc);
    if (!trigger) {
        logModelRead('chatgpt', 'model-trigger-missing');
        closeChatGptMenus(doc);
        return [];
    }
    if (!submenuFirst) {
        logModelRead('chatgpt', 'model-items-missing');
        closeChatGptMenus(doc);
        return [];
    }

    const models: DomModelInfo[] = [];
    for (const item of doc.querySelectorAll<HTMLElement>(submenuSelector)) {
        const label = getChatGptItemLabel(item);
        if (!label || isChatGptReasoningLabel(label)) continue;
        const id = chatGptModelLabelToId(label);
        const name = chatGptModelLabelToName(label);
        if (!models.some((model) => model.id === id)) {
            models.push({ id, name });
        }
    }

    closeChatGptMenus(doc);
    await delay(100);
    logModelRead('chatgpt', 'found', { count: models.length, modelIds: models.map((m) => m.id) });
    return models;
}

// ─── Claude 模型选择器 & 思考档位 ────────────────────────────────────────────
// 选择器经浏览器实探（2026-06）验证：
//   模型触发器：[data-testid="model-selector-dropdown"]（按钮，显示当前模型+档位）
//   模型菜单项：[role="menu"] [role="menuitemradio"]
//   模型名称：  .font-ui 内的直接文本节点（跳过 badge 子元素，如「Included until …」）
//   ID 派生：   name.toLowerCase().replace(/\s+/g, '-').replace(/\./g, '-')
//               例："Sonnet 4.6" → "sonnet-4-6"
//   档位触发器：[data-testid="effort-menu-trigger"]（在模型菜单内）
//   档位选项：  [data-testid="effort-option-{low|medium|high|max}"]

const CLAUDE_MODEL_TRIGGER = '[data-testid="model-selector-dropdown"]';
// 模型项用全局 menuitemradio + .font-ui 过滤识别（不限定在单个 [role="menu"]，
// 因 "More models" 子菜单可能渲染在独立 portal 容器里）。effort 选项无 .font-ui 自动排除。
const CLAUDE_MODEL_ITEM_SEL = '[role="menuitemradio"]';
const CLAUDE_EFFORT_TRIGGER = '[data-testid="effort-menu-trigger"]';
// "More models" 子菜单触发器（精简布局下顶层只直接显示 1 个模型，其余在此子菜单内）。
const CLAUDE_MORE_MODELS_RE = /more models|更多模型/i;
// 隐藏受控页冷启动（loadURL 完成后 SPA 仍在水合）时，模型触发器要数秒才出现，
// 比常规 MODEL_TRIGGER_TIMEOUT_MS 更宽裕，覆盖慢网络/慢机器的首次读取。
const CLAUDE_COLD_START_TRIGGER_TIMEOUT_MS = 15_000;

/** 从 .font-ui span 提取纯模型名（只取直接文本节点，跳过 badge 子元素）。 */
function extractClaudeModelName(itemEl: Element): string {
    const nameEl = itemEl.querySelector('.font-ui');
    if (!nameEl) return '';
    return Array.from(nameEl.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => (n.textContent ?? '').trim())
        .filter(Boolean)
        .join('');
}

/** 模型名 → 稳定 slug ID（"Sonnet 4.6" → "sonnet-4-6"）。 */
function claudeModelNameToId(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/\./g, '-');
}

/** 收集当前 DOM 中所有「模型」menuitemradio（带 .font-ui 的），去重累加到 into。 */
function collectClaudeModelItems(doc: Document, into: DomModelInfo[]): void {
    for (const item of doc.querySelectorAll<HTMLElement>(CLAUDE_MODEL_ITEM_SEL)) {
        const name = extractClaudeModelName(item);
        if (!name) continue;
        const id = claudeModelNameToId(name);
        if (!into.some((m) => m.id === id)) {
            into.push({ id, name });
        }
    }
}

/** 找到目标 modelId 对应的 menuitemradio 元素（带 .font-ui 的模型项）。 */
function findClaudeModelItem(doc: Document, modelId: string): HTMLElement | null {
    const normalizedModelId = claudeModelNameToId(modelId);
    for (const item of doc.querySelectorAll<HTMLElement>(CLAUDE_MODEL_ITEM_SEL)) {
        const name = extractClaudeModelName(item);
        if (name && (name === modelId || claudeModelNameToId(name) === normalizedModelId)) {
            return item;
        }
    }
    return null;
}

/**
 * 健壮地"点击元素打开菜单"：先合成 pointer 序列，若 200ms 内未出现期望选择器，
 * 再回退到原生 el.click()。隐藏/无焦点的 Electron 受控窗口里，Base UI 的下拉触发器
 * 往往只响应原生 .click()，不响应合成 PointerEvent（浏览器实探 2026-06 验证）。
 */
async function openMenuRobust(el: HTMLElement, doc: Document, waitSelector: string, timeoutMs: number): Promise<Element | null> {
    firePointerClick(el);
    let found = await waitForSelector(doc, waitSelector, 250);
    if (found) return found;
    // 回退：原生 click（隐藏窗口下对 Base UI 触发器更可靠）。
    if (typeof el.click === 'function') el.click();
    found = await waitForSelector(doc, waitSelector, timeoutMs);
    return found;
}

/**
 * 健壮地"点击选中一个菜单项"（menuitemradio 等）：合成 pointer + 原生 click 都触发。
 * radio 项选中是幂等的，双触发不会出问题；隐藏窗口下原生 click 更可靠。
 */
function clickItemRobust(el: HTMLElement): void {
    firePointerClick(el);
    if (typeof el.click === 'function') el.click();
}

/**
 * 展开 "More models" 子菜单（若存在）。精简布局下顶层只直接显示 1 个模型，
 * 完整列表在此子菜单里。返回是否点开过。
 */
async function expandClaudeMoreModels(doc: Document): Promise<boolean> {
    const moreItem = Array.from(doc.querySelectorAll<HTMLElement>('[role="menuitem"][aria-haspopup="menu"]'))
        .find((el) => CLAUDE_MORE_MODELS_RE.test(el.textContent ?? ''));
    if (!moreItem) return false;
    const before = doc.querySelectorAll(CLAUDE_MODEL_ITEM_SEL).length;
    // 子菜单可能 hover 或 click 触发；先合成 pointer + hover，再回退原生 click。
    const hoverOpts: PointerEventInit = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    moreItem.dispatchEvent(new PointerEvent('pointerover', hoverOpts));
    moreItem.dispatchEvent(new PointerEvent('pointerenter', hoverOpts));
    moreItem.dispatchEvent(new PointerEvent('pointermove', hoverOpts));
    firePointerClick(moreItem);
    await delay(300);
    // 若子菜单未增加项，回退原生 click。
    if (doc.querySelectorAll(CLAUDE_MODEL_ITEM_SEL).length <= before && typeof moreItem.click === 'function') {
        moreItem.click();
        await delay(400);
    }
    return true;
}

/** 探测 Claude 受控页当前状态，用于区分「未登录」「未水合」「就绪」。 */
function probeClaudePageState(doc: Document): Record<string, unknown> {
    const href = (() => { try { return doc.location?.href ?? ''; } catch { return ''; } })();
    return {
        href,
        readyState: doc.readyState,
        hasInput: Boolean(doc.querySelector(DOM_CHAT_SELECTORS.claude.input)),
        hasModelTrigger: Boolean(doc.querySelector(CLAUDE_MODEL_TRIGGER)),
        // 登录页特征：URL 含 /login 或页面有登录按钮
        looksLikeLogin: /\/login|\/auth/i.test(href)
            || Boolean(doc.querySelector('a[href*="login"], button[data-testid*="login"]')),
        bodyTextLen: (doc.body?.innerText ?? '').length
    };
}

async function readClaudeModels(doc: Document): Promise<DomModelInfo[]> {
    logModelRead('claude', 'read-start', probeClaudePageState(doc));
    // 等待模型触发器出现：隐藏受控页冷启动导航后 SPA 需数秒水合，
    // 立即 querySelector 往往为 null。等待可让首次读取拿到真实模型，
    // 避免「读空 → ModelsNotReadyError → loaded:false → 永久加载」。
    const btn = (await waitForSelector(doc, CLAUDE_MODEL_TRIGGER, CLAUDE_COLD_START_TRIGGER_TIMEOUT_MS)) as HTMLElement | null;
    if (!btn) {
        logModelRead('claude', 'trigger-missing', probeClaudePageState(doc));
        return [];
    }

    const firstItem = await openMenuRobust(btn, doc, CLAUDE_MODEL_ITEM_SEL, MODEL_TRIGGER_TIMEOUT_MS);
    if (!firstItem) {
        logModelRead('claude', 'items-missing', probeClaudePageState(doc));
        doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return [];
    }

    const models: DomModelInfo[] = [];
    // 1. 先收集顶层直接可见的模型项（展开布局下这里就有全部）。
    collectClaudeModelItems(doc, models);
    const topLevelCount = models.length;
    // 2. 展开 "More models" 子菜单补全（精简布局下顶层只有 1 个，其余在子菜单内）。
    const expanded = await expandClaudeMoreModels(doc);
    if (expanded) {
        collectClaudeModelItems(doc, models);
    }

    doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await delay(100);
    logModelRead('claude', 'found', { count: models.length, topLevelCount, expandedMoreModels: expanded });
    return models;
}

async function setClaudeModel(doc: Document, modelId: string): Promise<{ ok: boolean; note: string }> {
    const btn = (await waitForSelector(doc, CLAUDE_MODEL_TRIGGER, MODEL_TRIGGER_TIMEOUT_MS)) as HTMLElement | null;
    if (!btn) return { ok: false, note: 'claude-model-trigger-not-found' };

    const firstItem = await openMenuRobust(btn, doc, CLAUDE_MODEL_ITEM_SEL, 3_000);
    if (!firstItem) {
        doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return { ok: false, note: 'claude-model-items-not-found' };
    }

    // 先在顶层找目标；找不到则展开 "More models" 子菜单再找（精简布局）。
    let target = findClaudeModelItem(doc, modelId);
    if (!target) {
        const expanded = await expandClaudeMoreModels(doc);
        if (expanded) {
            target = findClaudeModelItem(doc, modelId);
        }
    }

    if (target) {
        if (target.getAttribute('aria-checked') === 'true') {
            doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            return { ok: true, note: 'already-selected' };
        }
        clickItemRobust(target);
        await delay(150);
        // 点击模型后菜单可能仍开着，显式关闭以免后续 injectPrompt 被 focus-trap 截获。
        doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await delay(100);
        return { ok: true, note: `switched-to:${modelId}` };
    }

    doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { ok: false, note: `claude-model-not-in-picker:${modelId}` };
}

// Claude 真实档位菜单支持 low/medium/high，直接按 effort 映射到对应 effort-option，不再压缩成二态。
async function setClaudeReasoningEffort(doc: Document, effort: ReasoningEffort): Promise<{ ok: boolean; note: string }> {
    const targetLevel = effort;
    const targetSelector = `[data-testid="effort-option-${targetLevel}"]`;

    const btn = (await waitForSelector(doc, CLAUDE_MODEL_TRIGGER, MODEL_TRIGGER_TIMEOUT_MS)) as HTMLElement | null;
    if (!btn) return { ok: false, note: 'claude-model-trigger-not-found' };

    // 打开模型菜单（健壮：合成 pointer 失败时回退原生 click），等档位触发器出现
    const effortTrigger = await openMenuRobust(btn, doc, CLAUDE_EFFORT_TRIGGER, 3_000);
    if (!effortTrigger) {
        doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return { ok: false, note: 'claude-effort-trigger-not-found' };
    }

    // 若档位选项已在 DOM 中且已选中则直接关闭
    const alreadySelected = doc.querySelector<HTMLElement>(`${targetSelector}[aria-checked="true"]`);
    if (alreadySelected) {
        doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return { ok: true, note: 'already-selected' };
    }

    // 打开档位子菜单（同样健壮回退）
    const targetEl = await openMenuRobust(effortTrigger as HTMLElement, doc, targetSelector, 3_000);
    if (!targetEl) {
        // 此时模型菜单与档位子菜单均可能打开，需关闭两层以消除 focus-trap。
        doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await delay(100);
        doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return { ok: false, note: `claude-effort-option-not-found:${targetLevel}` };
    }

    clickItemRobust(targetEl as HTMLElement);
    await delay(150);
    // 点击档位选项后档位子菜单关闭，但父级模型选择器可能仍开着；
    // 发送两次 Escape 确保两层菜单均关闭，避免 focus-trap 截获后续 injectPrompt 的焦点。
    doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await delay(100);
    doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await delay(150);
    return { ok: true, note: `set-effort:${targetLevel}` };
}

/**
 * 从页面模型选择器读取可用模型列表。
 * - chatgpt：__composer-pill 顶层仍显示推理档位，但同一菜单内存在模型子菜单，动态读取。
 * - gemini：Flash-Lite / Flash / Pro 是真实模型，动态读取。
 * - claude：Fable 5 / Opus 4.8 / Sonnet 4.6 / Haiku 4.5 等，动态读取。
 */
export async function readAvailableModels(doc: Document, provider: DomChatProvider): Promise<DomModelInfo[]> {
    try {
        if (provider === 'chatgpt') return await readChatGptModels(doc);
        if (provider === 'gemini') return await readGeminiModels(doc);
        if (provider === 'claude') return await readClaudeModels(doc);
    } catch {
        // 忽略错误，返回空数组触发调用方回退
    }
    return [];
}

async function setGeminiModel(doc: Document, modelId: string): Promise<{ ok: boolean; note: string }> {
    const { btn, firstItem } = await ensureGeminiModeMenuOpen(doc);
    if (!btn) return { ok: false, note: 'model-picker-not-found' };
    if (!firstItem) {
        closeGeminiMenus(doc);
        return { ok: false, note: 'picker-items-not-found' };
    }

    // 优先按 data-mode-id 精确匹配；若传入的是显示名（如 '3.1 Pro'），则 fallback 到标签文本匹配。
    let target = doc.querySelector<HTMLElement>(`gem-menu-item[data-mode-id="${CSS.escape(modelId)}"]`);
    let resolvedId = modelId;
    if (!target) {
        const normalizedInput = modelId.toLowerCase().replace(/[^a-z0-9]/g, '');
        const byLabel = Array.from(doc.querySelectorAll<HTMLElement>(GEMINI_MODEL_ITEM_SEL))
            .find((el) => {
                const label = getGeminiItemLabel(el);
                return label === modelId
                    || label.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedInput;
            });
        if (byLabel) {
            target = byLabel;
            resolvedId = byLabel.getAttribute('data-mode-id') ?? modelId;
        }
    }
    if (!target) {
        closeGeminiMenus(doc);
        return { ok: false, note: `model-not-in-picker:${modelId}` };
    }

    if (isGeminiSelectedItem(target)) {
        closeGeminiMenus(doc);
        return { ok: true, note: 'already-selected' };
    }

    if (isGeminiDisabledItem(target)) {
        closeGeminiMenus(doc);
        return { ok: false, note: `model-disabled:${modelId}` };
    }

    clickItemRobust(target);
    await delay(200);
    if (!(await verifyGeminiModelSelected(doc, resolvedId))) {
        return { ok: false, note: `model-selection-not-applied:${modelId}` };
    }
    return { ok: true, note: `switched-to:${resolvedId}` };
}

async function setChatGptModel(doc: Document, modelId: string): Promise<{ ok: boolean; note: string }> {
    const { btn, firstItem } = await ensureChatGptPillMenuOpen(doc);
    if (!btn) return { ok: false, note: 'chatgpt-model-picker-not-found' };
    if (!firstItem) {
        closeChatGptMenus(doc);
        return { ok: false, note: 'chatgpt-picker-items-not-found' };
    }

    const { trigger, submenuSelector, firstItem: submenuFirst } = await ensureChatGptModelMenuOpen(doc);
    if (!trigger) {
        closeChatGptMenus(doc);
        return { ok: false, note: 'chatgpt-model-trigger-not-found' };
    }
    if (!submenuFirst) {
        closeChatGptMenus(doc);
        return { ok: false, note: 'chatgpt-model-items-not-found' };
    }

    const target = Array.from(doc.querySelectorAll<HTMLElement>(submenuSelector))
        .find((el) => chatGptModelMatches(getChatGptItemLabel(el), modelId));
    if (!target) {
        closeChatGptMenus(doc);
        return { ok: false, note: `chatgpt-model-not-in-picker:${modelId}` };
    }

    if (isChatGptSelectedItem(target)) {
        closeChatGptMenus(doc);
        return { ok: true, note: 'already-selected' };
    }

    clickItemRobust(target);
    await delay(200);
    if (!(await verifyChatGptModelSelected(doc, modelId))) {
        return { ok: false, note: `chatgpt-model-selection-not-applied:${modelId}` };
    }
    return { ok: true, note: `switched-to:${modelId}` };
}

/**
 * 在页面内切换模型（幂等）。
 */
export async function setActiveModel(
    doc: Document,
    provider: DomChatProvider,
    modelId: string
): Promise<{ ok: boolean; note: string }> {
    try {
        if (provider === 'chatgpt') return await setChatGptModel(doc, modelId);
        if (provider === 'gemini') return await setGeminiModel(doc, modelId);
        if (provider === 'claude') return await setClaudeModel(doc, modelId);
    } catch (err) {
        return { ok: false, note: `error:${String(err)}` };
    }
    return { ok: false, note: 'unknown-provider' };
}

// ChatGPT 推理档位：__composer-pill 顶层菜单中的三态 radio。
// low/medium/high 至少支持中英文文案，并在缺少稳定文案时按三档顺序兜底。
async function setChatGPTReasoningEffort(doc: Document, effort: ReasoningEffort): Promise<{ ok: boolean; note: string }> {
    const targetLabels = getChatGptReasoningLabels(effort);
    const targetToken = getChatGptReasoningToken(effort);
    const { btn, firstItem } = await ensureChatGptPillMenuOpen(doc);
    if (!btn) return { ok: false, note: 'reasoning-picker-not-found' };
    if (!firstItem) {
        closeChatGptMenus(doc);
        return { ok: false, note: 'picker-items-not-found' };
    }

    const target = findChatGptReasoningItem(doc, effort);
    if (!target) {
        closeChatGptMenus(doc);
        return { ok: false, note: `reasoning-item-not-found:${targetToken}` };
    }

    if (targetLabels.includes(getChatGptPillLabel(doc)) || isChatGptSelectedItem(target)) {
        closeChatGptMenus(doc);
        return { ok: true, note: 'already-selected' };
    }

    clickItemRobust(target);
    await delay(200);
    if (!(await verifyChatGptReasoningSelected(doc, effort))) {
        console.warn('[DomChatReasoning]', JSON.stringify({
            provider: 'chatgpt',
            stage: 'selection-not-applied',
            targetLabels,
            targetToken,
            buttonLabel: getChatGptPillLabel(doc)
        }));
        return { ok: false, note: `chatgpt-reasoning-selection-not-applied:${targetToken}` };
    }
    return { ok: true, note: `set-reasoning:${targetToken}` };
}

// Gemini 推理档位：模型菜单中的「思考等级」子菜单。
// low/medium → 标准，high → 扩展；不应改动当前模型。
async function setGeminiReasoningEffort(doc: Document, effort: ReasoningEffort): Promise<{ ok: boolean; note: string }> {
    const targetLabel = effort === 'high' ? GEMINI_REASONING_EXTENDED_LABEL : GEMINI_REASONING_STANDARD_LABEL;
    const targetLevel = effort === 'high' ? 'extended' : 'standard';

    const { btn, firstItem } = await ensureGeminiModeMenuOpen(doc);
    if (!btn) return { ok: false, note: 'gemini-mode-btn-missing' };
    if (!firstItem) {
        closeGeminiMenus(doc);
        return { ok: false, note: 'gemini-mode-items-missing' };
    }

    const { trigger, firstItem: submenuFirst, submenuSelector } = await ensureGeminiReasoningMenuOpen(doc);
    if (!trigger) {
        closeGeminiMenus(doc);
        return { ok: false, note: 'gemini-thinking-trigger-not-found' };
    }
    if (!submenuFirst) {
        closeGeminiMenus(doc);
        return { ok: false, note: 'gemini-thinking-items-missing' };
    }

    const target = Array.from(doc.querySelectorAll<HTMLElement>(submenuSelector))
        .find((el) => getGeminiItemLabel(el) === targetLabel);
    if (!target) {
        closeGeminiMenus(doc);
        return { ok: false, note: `gemini-thinking-option-not-found:${targetLevel}` };
    }

    if (isGeminiSelectedItem(target)) {
        closeGeminiMenus(doc);
        return { ok: true, note: 'already-selected' };
    }

    if (isGeminiDisabledItem(target)) {
        closeGeminiMenus(doc);
        return { ok: false, note: `gemini-thinking-option-disabled:${targetLevel}` };
    }

    clickItemRobust(target);
    await delay(200);
    if (!(await verifyGeminiReasoningSelected(doc, targetLabel))) {
        return { ok: false, note: `gemini-thinking-selection-not-applied:${targetLevel}` };
    }
    return { ok: true, note: `set-reasoning:${targetLevel}` };
}

/**
 * 在页面内切换推理档位（幂等）。失败不阻塞发送。
 * - chatgpt: low/medium/high → 极速/均衡/高级（via __composer-pill 顶层菜单）
 * - gemini:  low/medium → 标准，high → 扩展（via 模型菜单中的「思考等级」子菜单）
 * - claude:  effort 直接映射 effort-{low|medium|high}（via 模型下拉 → 档位子菜单）
 */
export async function setReasoningEffort(
    doc: Document,
    provider: DomChatProvider,
    effort: ReasoningEffort
): Promise<{ ok: boolean; note: string }> {
    try {
        if (provider === 'chatgpt') return await setChatGPTReasoningEffort(doc, effort);
        if (provider === 'gemini') return await setGeminiReasoningEffort(doc, effort);
        if (provider === 'claude') return await setClaudeReasoningEffort(doc, effort);
    } catch (err) {
        return { ok: false, note: `error:${String(err)}` };
    }
    return { ok: false, note: 'unknown-provider' };
}
