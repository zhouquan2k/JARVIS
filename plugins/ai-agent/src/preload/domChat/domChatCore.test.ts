// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import {
    findEnabledSendButton,
    findInput,
    isGenerating,
    readAvailableModels,
    readLatestReply,
    setActiveModel,
    setReasoningEffort,
    setWebSearchEnabled
} from './domChatCore';

function setBody(html: string): void {
    document.body.innerHTML = html;
}

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('readLatestReply — gemini', () => {
    it('extracts the latest model-response answer, ignoring search status and "Gemini 说" label', () => {
        setBody(`
            <div data-test-id="model-response"><div class="markdown"><p>纽约是美国第一大城市。</p></div></div>
            <div class="thinking-status">正在搜索网络</div>
            <div data-test-id="model-response">
                <div class="model-response-text">
                    <span class="label">Gemini 说</span>
                    <div class="markdown"><p>美国第二大城市是<strong>洛杉矶</strong>（Los Angeles）。</p></div>
                </div>
            </div>
        `);

        const text = readLatestReply(document, 'gemini');

        expect(text).toContain('洛杉矶');
        expect(text).toContain('Los Angeles');
        // 取最后一条气泡，不应混入上一条回答。
        expect(text).not.toContain('纽约');
        expect(text).not.toContain('第一大城市');
        // 不应混入联网搜索状态与「Gemini 说」标签。
        expect(text).not.toContain('正在搜索网络');
        expect(text).not.toContain('Gemini 说');
    });

    it('returns empty string when no model-response bubble exists', () => {
        setBody('<div class="thinking-status">正在搜索网络</div>');
        expect(readLatestReply(document, 'gemini')).toBe('');
    });

    it('strips a leading "Gemini 说" heading rendered as an H2 (avoids giant heading in UI)', () => {
        setBody(`
            <div data-test-id="model-response">
                <h2>Gemini 说</h2>
                <div class="markdown"><p>美国第二大城市是洛杉矶。</p></div>
            </div>
        `);
        const text = readLatestReply(document, 'gemini');
        expect(text).not.toContain('Gemini 说');
        expect(text).not.toMatch(/^#/);
        expect(text).toContain('美国第二大城市是洛杉矶');
    });
});

describe('readLatestReply — chatgpt', () => {
    it('extracts the last assistant markdown content', () => {
        setBody(`
            <div data-message-author-role="user"><div class="markdown">问题</div></div>
            <div data-message-author-role="assistant"><div class="markdown">旧回答</div></div>
            <div data-message-author-role="assistant"><div class="markdown">美国第一大城市是纽约。</div></div>
        `);

        const text = readLatestReply(document, 'chatgpt');
        expect(text).toContain('美国第一大城市是纽约');
        expect(text).not.toContain('旧回答');
    });
});

describe('isGenerating', () => {
    it('gemini: true while a stop button is present, false otherwise', () => {
        setBody('<button class="stop" aria-label="Stop response"></button>');
        expect(isGenerating(document, 'gemini')).toBe(true);
        setBody('<div></div>');
        expect(isGenerating(document, 'gemini')).toBe(false);
    });

    it('chatgpt: keyed on data-testid stop-button', () => {
        setBody('<button data-testid="stop-button"></button>');
        expect(isGenerating(document, 'chatgpt')).toBe(true);
        setBody('<button data-testid="send-button"></button>');
        expect(isGenerating(document, 'chatgpt')).toBe(false);
    });
});

describe('findEnabledSendButton — gemini', () => {
    it('matches .send-button class (locale-independent)', () => {
        setBody('<button class="send-button"></button>');
        expect(findEnabledSendButton(document, 'gemini')).not.toBeNull();
    });

    it('matches a localized aria-label fallback (发送)', () => {
        setBody('<button aria-label="发送"></button>');
        expect(findEnabledSendButton(document, 'gemini')).not.toBeNull();
    });

    it('returns null when disabled or aria-disabled', () => {
        setBody('<button class="send-button" disabled></button>');
        expect(findEnabledSendButton(document, 'gemini')).toBeNull();
        setBody('<button class="send-button" aria-disabled="true"></button>');
        expect(findEnabledSendButton(document, 'gemini')).toBeNull();
    });
});

describe('findInput', () => {
    it('gemini: finds the Quill contenteditable', () => {
        setBody('<rich-textarea><div class="ql-editor" contenteditable="true"></div></rich-textarea>');
        expect(findInput(document, 'gemini')).not.toBeNull();
    });

    it('chatgpt: finds #prompt-textarea', () => {
        setBody('<div id="prompt-textarea" contenteditable="true"></div>');
        expect(findInput(document, 'chatgpt')).not.toBeNull();
    });
});

/**
 * 模拟 ChatGPT 的 Radix「+」菜单联网开关：
 * - 在 composer-plus-btn 上 pointerdown 渲染「网页搜索」menuitemradio；
 * - 在该 menuitemradio 上 pointerdown 翻转开关，开启时往 form 内加 data-tone="accent" 药丸。
 * 与真实站点一致地以 pointer 事件驱动（普通 click 不触发）。
 */
function mountChatgptComposer(active = false): void {
    document.body.innerHTML = '<form><button data-testid="composer-plus-btn" type="button"></button></form>';
    const form = document.querySelector('form')!;
    const plus = document.querySelector<HTMLElement>('[data-testid="composer-plus-btn"]')!;
    let searchOn = active;

    const renderPill = () => {
        const existing = form.querySelector('button[data-tone="accent"]');
        if (searchOn && !existing) {
            const pill = document.createElement('button');
            pill.setAttribute('data-tone', 'accent');
            pill.setAttribute('aria-label', '搜索，点击以重试');
            pill.textContent = '搜索';
            form.appendChild(pill);
        } else if (!searchOn && existing) {
            existing.remove();
        }
    };
    renderPill();

    plus.addEventListener('pointerdown', () => {
        if (document.querySelector('[role="menuitemradio"]')) {
            return;
        }
        const item = document.createElement('div');
        item.setAttribute('role', 'menuitemradio');
        item.textContent = '网页搜索';
        item.addEventListener('pointerdown', () => {
            searchOn = !searchOn;
            renderPill();
            item.remove(); // Radix 点击后菜单关闭
        });
        document.body.appendChild(item);
    });
}

/**
 * 挂载 ChatGPT __composer-pill 推理档位菜单。
 * Thinking/Instant 是推理档位（非模型），trigger: button.__composer-pill[aria-haspopup="menu"]。
 * @param selectedId 当前已选档位（aria-checked="true"）。
 */
function mountChatgptPillMenu(selectedId = 'model-switcher-gpt-5-5'): HTMLElement {
    document.body.innerHTML = '<button class="__composer-pill" aria-haspopup="menu" type="button">Instant</button>';
    const btn = document.querySelector<HTMLElement>('button.__composer-pill[aria-haspopup="menu"]')!;
    const models = [
        { id: 'model-switcher-gpt-5-5', name: 'Instant' },
        { id: 'model-switcher-gpt-5-5-thinking', name: 'Thinking' }
    ];
    const closeMenu = () => {
        for (const el of document.querySelectorAll('[role="menuitemradio"][data-testid^="model-switcher"]')) el.remove();
    };
    btn.addEventListener('pointerdown', () => {
        if (document.querySelector('[role="menuitemradio"][data-testid^="model-switcher"]')) return;
        for (const m of models) {
            const item = document.createElement('div');
            item.setAttribute('role', 'menuitemradio');
            item.setAttribute('data-testid', m.id);
            item.setAttribute('aria-checked', m.id === selectedId ? 'true' : 'false');
            item.textContent = `• ${m.name}`;
            item.addEventListener('pointerdown', closeMenu); // Radix 选中后菜单关闭
            document.body.appendChild(item);
        }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
    return btn;
}

/**
 * 挂载 Gemini 模型选择器：[data-test-id="bard-mode-menu-button"] 触发，
 * pointerdown 渲染 gem-menu-item[role="menuitem"]（data-mode-id + .label 子元素）。
 * @param selectedId 当前已选模型（gem-menu-item-content.selected）。
 */
function mountGeminiModelPicker(selectedId = 'fbb127bbb056c959'): HTMLElement {
    document.body.innerHTML = '<button data-test-id="bard-mode-menu-button" type="button">Flash</button>';
    const btn = document.querySelector<HTMLElement>('[data-test-id="bard-mode-menu-button"]')!;
    const models = [
        { id: 'cf41b0e0dd7d53e5', name: '3.1 Flash-Lite' },
        { id: 'fbb127bbb056c959', name: '3.5 Flash' },
        { id: '9d8ca3786ebdfbea', name: '3.1 Pro' }
    ];
    const closeMenu = () => {
        for (const el of document.querySelectorAll('gem-menu-item[role="menuitem"]')) el.remove();
    };
    btn.addEventListener('pointerdown', () => {
        if (document.querySelector('gem-menu-item[role="menuitem"]')) return;
        for (const m of models) {
            const item = document.createElement('gem-menu-item');
            item.setAttribute('role', 'menuitem');
            item.setAttribute('data-mode-id', m.id);
            const content = document.createElement('gem-menu-item-content');
            if (m.id === selectedId) content.classList.add('selected');
            const label = document.createElement('span');
            label.className = 'label';
            label.textContent = m.name;
            content.appendChild(label);
            item.appendChild(content);
            item.addEventListener('pointerdown', closeMenu); // 选中后菜单关闭
            document.body.appendChild(item);
        }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
    return btn;
}

describe('readAvailableModels — chatgpt', () => {
    it('always returns [] — Thinking/Instant are reasoning effort levels, not models', async () => {
        // Even with pill menu present, chatgpt returns [] (single dom model)
        mountChatgptPillMenu();
        const models = await readAvailableModels(document, 'chatgpt');
        expect(models).toEqual([]);
    });

    it('returns [] immediately without waiting for DOM (no timer needed)', async () => {
        setBody('<div></div>');
        const start = Date.now();
        const models = await readAvailableModels(document, 'chatgpt');
        expect(models).toEqual([]);
        expect(Date.now() - start).toBeLessThan(100);
    });
});

describe('readAvailableModels — gemini', () => {
    it('reads gem-menu-item entries with data-mode-id ids and .label names', async () => {
        mountGeminiModelPicker();
        const models = await readAvailableModels(document, 'gemini');
        expect(models).toEqual([
            { id: 'cf41b0e0dd7d53e5', name: '3.1 Flash-Lite' },
            { id: 'fbb127bbb056c959', name: '3.5 Flash' },
            { id: '9d8ca3786ebdfbea', name: '3.1 Pro' }
        ]);
        expect(document.querySelector('gem-menu-item[role="menuitem"]')).toBeNull();
    });
});

describe('setActiveModel — chatgpt', () => {
    it('is a noop — chatgpt uses single dom model (reasoning effort is separate)', async () => {
        setBody('<div></div>');
        const result = await setActiveModel(document, 'chatgpt', 'anything');
        expect(result).toEqual({ ok: true, note: 'chatgpt-single-model-noop' });
    });
});

describe('setActiveModel — gemini', () => {
    it('switches to a non-selected model by data-mode-id', async () => {
        mountGeminiModelPicker('fbb127bbb056c959');
        const result = await setActiveModel(document, 'gemini', '9d8ca3786ebdfbea');
        expect(result.ok).toBe(true);
        expect(result.note).toBe('switched-to:9d8ca3786ebdfbea');
    });

    it('is idempotent when the requested model is already selected', async () => {
        mountGeminiModelPicker('9d8ca3786ebdfbea');
        const result = await setActiveModel(document, 'gemini', '9d8ca3786ebdfbea');
        expect(result).toEqual({ ok: true, note: 'already-selected' });
    });
});

describe('setReasoningEffort — chatgpt', () => {
    it('switches to Thinking (high=true) via __composer-pill', async () => {
        mountChatgptPillMenu('model-switcher-gpt-5-5');
        const result = await setReasoningEffort(document, 'chatgpt', true);
        expect(result.ok).toBe(true);
        expect(result.note).toBe('set-reasoning:thinking');
    });

    it('switches to Instant (high=false) via __composer-pill', async () => {
        mountChatgptPillMenu('model-switcher-gpt-5-5-thinking');
        const result = await setReasoningEffort(document, 'chatgpt', false);
        expect(result.ok).toBe(true);
        expect(result.note).toBe('set-reasoning:instant');
    });

    it('is idempotent when target is already selected', async () => {
        mountChatgptPillMenu('model-switcher-gpt-5-5-thinking');
        const result = await setReasoningEffort(document, 'chatgpt', true);
        expect(result).toEqual({ ok: true, note: 'already-selected' });
    });

    it('reports failure when pill button is absent', async () => {
        setBody('<div></div>');
        const result = await setReasoningEffort(document, 'chatgpt', true);
        expect(result.ok).toBe(false);
        expect(result.note).toBe('reasoning-picker-not-found');
    });
});

describe('setReasoningEffort — gemini', () => {
    it('reports btn-missing when thinking level selector not found (unverified selector)', async () => {
        // Gemini 思考等级选择器尚未经浏览器验证，预期 ok:false 直到选择器确认后更新。
        setBody('<div></div>');
        const result = await setReasoningEffort(document, 'gemini', true);
        expect(result.ok).toBe(false);
        expect(result.note).toBe('gemini-thinking-btn-missing');
    });
});

describe('setWebSearchEnabled — gemini', () => {
    it('is a no-op (Gemini grounds with Google Search by default)', async () => {
        setBody('<div></div>');
        const result = await setWebSearchEnabled(document, 'gemini', true);
        expect(result.ok).toBe(true);
        expect(result.note).toBe('gemini-default-grounded-noop');
        // 不依赖页面上任何按钮。
        const off = await setWebSearchEnabled(document, 'gemini', false);
        expect(off.ok).toBe(true);
    });
});

describe('setWebSearchEnabled — chatgpt', () => {
    it('enables web search via the "+" menu radio when currently off', async () => {
        mountChatgptComposer(false);
        const result = await setWebSearchEnabled(document, 'chatgpt', true);
        expect(result).toEqual({ ok: true, note: 'enabled' });
        expect(document.querySelector('form button[data-tone="accent"]')).not.toBeNull();
    });

    it('disables web search via the "+" menu radio when currently on', async () => {
        mountChatgptComposer(true);
        const result = await setWebSearchEnabled(document, 'chatgpt', false);
        expect(result).toEqual({ ok: true, note: 'disabled' });
        expect(document.querySelector('form button[data-tone="accent"]')).toBeNull();
    });

    it('is idempotent: already-on stays on without opening the menu', async () => {
        mountChatgptComposer(true);
        const result = await setWebSearchEnabled(document, 'chatgpt', true);
        expect(result).toEqual({ ok: true, note: 'already-correct' });
        expect(document.querySelector('[role="menuitemradio"]')).toBeNull();
    });

    it('reports failure when the composer "+" button is absent', async () => {
        setBody('<div></div>');
        const result = await setWebSearchEnabled(document, 'chatgpt', true);
        expect(result.ok).toBe(false);
        expect(result.note).toContain('plus button not found');
    });
});
