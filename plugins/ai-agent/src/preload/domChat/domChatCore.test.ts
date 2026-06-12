// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    findEnabledSendButton,
    findInput,
    isGenerating,
    readAvailableModels,
    readLatestReply,
    setActiveModel,
    setInputText,
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

describe('readLatestReply — claude', () => {
    it('extracts text from .font-claude-response inside [data-is-streaming]', () => {
        setBody(`
            <div data-is-streaming="false">
                <div class="font-claude-response">旧回答</div>
            </div>
            <div data-is-streaming="true">
                <div class="font-claude-response">美国第二大城市是洛杉矶。</div>
            </div>
        `);
        const text = readLatestReply(document, 'claude');
        expect(text).toContain('洛杉矶');
        expect(text).not.toContain('旧回答');
    });

    it('falls back to bubble innerText when .font-claude-response is absent', () => {
        setBody(`<div data-is-streaming="false"><p>回复文本</p></div>`);
        const text = readLatestReply(document, 'claude');
        expect(text).toContain('回复文本');
    });

    it('returns empty string when no [data-is-streaming] bubble exists', () => {
        setBody('<div class="other">nothing</div>');
        expect(readLatestReply(document, 'claude')).toBe('');
    });
});

describe('isGenerating — claude', () => {
    it('true when Stop response button is present', () => {
        setBody('<button aria-label="Stop response"></button>');
        expect(isGenerating(document, 'claude')).toBe(true);
    });

    it('true when [data-is-streaming="true"] is present (fallback)', () => {
        setBody('<div data-is-streaming="true"></div>');
        expect(isGenerating(document, 'claude')).toBe(true);
    });

    it('false when neither stop button nor streaming element is present', () => {
        setBody('<div data-is-streaming="false"></div>');
        expect(isGenerating(document, 'claude')).toBe(false);
    });
});

describe('findInput — claude', () => {
    it('finds [data-testid="chat-input"]', () => {
        setBody('<div data-testid="chat-input" contenteditable="true" class="tiptap ProseMirror"></div>');
        expect(findInput(document, 'claude')).not.toBeNull();
    });
});

describe('findEnabledSendButton — claude', () => {
    it('finds button[aria-label="Send message"] when not disabled', () => {
        setBody('<button aria-label="Send message"></button>');
        expect(findEnabledSendButton(document, 'claude')).not.toBeNull();
    });

    it('returns null when button is disabled', () => {
        setBody('<button aria-label="Send message" disabled></button>');
        expect(findEnabledSendButton(document, 'claude')).toBeNull();
    });
});

describe('setWebSearchEnabled — claude', () => {
    it('is a no-op (claude web search is not controlled via composer)', async () => {
        setBody('<div></div>');
        const result = await setWebSearchEnabled(document, 'claude', true);
        expect(result.ok).toBe(true);
        expect(result.note).toBe('claude-no-composer-web-search-noop');
    });
});

describe('setActiveModel — claude', () => {
    it('returns not-found when model-selector-dropdown is absent (page not ready)', async () => {
        // 触发器缺失时等满超时再返回（处理 SPA 冷启动水合延迟），用 fake timers 快进。
        vi.useFakeTimers();
        try {
            setBody('<div></div>');
            const promise = setActiveModel(document, 'claude', 'sonnet-4-6');
            await vi.advanceTimersByTimeAsync(20_000);
            const result = await promise;
            expect(result.ok).toBe(false);
            expect(result.note).toMatch(/trigger-not-found|items-not-found/);
        } finally {
            vi.useRealTimers();
        }
    });

    it('returns already-selected when model item is aria-checked=true', async () => {
        setBody(`
            <button data-testid="model-selector-dropdown"></button>
            <div role="menu">
                <div role="menuitemradio" aria-checked="true">
                    <span class="font-ui">Sonnet 4.6</span>
                </div>
            </div>
        `);
        const result = await setActiveModel(document, 'claude', 'sonnet-4-6');
        expect(result).toEqual({ ok: true, note: 'already-selected' });
    });

    it('clicks and switches when target model is not yet selected', async () => {
        let clicked = false;
        setBody(`
            <button data-testid="model-selector-dropdown"></button>
            <div role="menu">
                <div role="menuitemradio" aria-checked="false" id="haiku-item">
                    <span class="font-ui">Haiku 4.5</span>
                </div>
            </div>
        `);
        document.getElementById('haiku-item')!.addEventListener('pointerdown', () => { clicked = true; });
        const result = await setActiveModel(document, 'claude', 'haiku-4-5');
        expect(result.ok).toBe(true);
        expect(result.note).toMatch(/switched-to/);
        expect(clicked).toBe(true);
    });
});

describe('readAvailableModels — claude', () => {
    it('returns [] when model-selector-dropdown is absent (page not ready / not logged in)', async () => {
        // 冷启动等待触发器超时后返回空，用 fake timers 快进避免真实等待 15s。
        vi.useFakeTimers();
        try {
            setBody('<div></div>');
            const promise = readAvailableModels(document, 'claude');
            await vi.advanceTimersByTimeAsync(20_000);
            const models = await promise;
            expect(models).toEqual([]);
        } finally {
            vi.useRealTimers();
        }
    });

    it('reads model names from menu items, skipping badge text in .font-ui', async () => {
        setBody(`
            <button data-testid="model-selector-dropdown"></button>
            <div role="menu">
                <div role="menuitemradio" aria-checked="false">
                    <span class="font-ui">Fable 5<span class="badge">Included until June 22</span></span>
                </div>
                <div role="menuitemradio" aria-checked="true">
                    <span class="font-ui">Sonnet 4.6</span>
                </div>
                <div role="menuitemradio" aria-checked="false">
                    <span class="font-ui">Haiku 4.5</span>
                </div>
            </div>
        `);
        const models = await readAvailableModels(document, 'claude');
        expect(models).toHaveLength(3);
        expect(models[0]).toEqual({ id: 'fable-5', name: 'Fable 5' });
        expect(models[1]).toEqual({ id: 'sonnet-4-6', name: 'Sonnet 4.6' });
        expect(models[2]).toEqual({ id: 'haiku-4-5', name: 'Haiku 4.5' });
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

describe('setInputText — contenteditable 多行注入', () => {
    // 用一个能感知 `\n` 的 execCommand 桩模拟真实编辑器（Quill/ProseMirror），
    // 验证逐行 insertText + insertParagraph 能写入完整多行内容，而非只剩首行。
    // happy-dom 不实现 execCommand，直接挂一个能感知 `\n` 的桩（用例结束后删除）。
    function stubEditorExecCommand(): { read: () => string } {
        let buffer = '';
        (document as unknown as { execCommand: unknown }).execCommand = (command: string, _ui?: boolean, value?: string) => {
            switch (command) {
                case 'selectAll':
                case 'delete':
                    buffer = '';
                    return true;
                case 'insertLineBreak':
                    buffer += '\n';
                    return true;
                case 'insertText':
                    buffer += value ?? '';
                    return true;
                default:
                    return false;
            }
        };
        return { read: () => buffer };
    }

    afterEach(() => {
        delete (document as unknown as { execCommand?: unknown }).execCommand;
    });

    it('写入完整多行提示词（行间转为 insertLineBreak，不丢失首行之后的内容）', () => {
        const editor = stubEditorExecCommand();
        setBody('<rich-textarea><div class="ql-editor" contenteditable="true"></div></rich-textarea>');
        const input = findInput(document, 'gemini')!;

        const prompt = '你正在一个 AI 群聊中。\n\n群聊成员：\n- A\n- B\n\n你的身份是「A」。';
        setInputText(input, prompt);

        expect(editor.read()).toBe(prompt);
    });

    it('单行提示词仍走一次 insertText（无多余段落）', () => {
        const editor = stubEditorExecCommand();
        setBody('<rich-textarea><div class="ql-editor" contenteditable="true"></div></rich-textarea>');
        const input = findInput(document, 'gemini')!;

        setInputText(input, '只有一行');

        expect(editor.read()).toBe('只有一行');
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

type ChatGptReasoningLevel = '极速' | '均衡' | '高级' | 'Fast' | 'Balanced' | 'Thinking';

/**
 * 挂载 ChatGPT __composer-pill 菜单。
 * 真实结构要点：
 * - 顶层推理项：role="menuitemradio"，可见标签支持中英文（如「极速 / 均衡 / 高级」或「Fast / Balanced / Thinking」）
 * - 顶层模型入口：role="menuitem"[aria-haspopup="menu"][aria-controls]
 * - 模型子菜单项：#<aria-controls> [role="menuitemradio"]，可见标签「5.5 / 5.4 / 5.3 / o3」
 */
function mountChatgptPillMenu(options: {
    selectedReasoning?: ChatGptReasoningLevel;
    reasoningLevels?: ChatGptReasoningLevel[];
    selectedModelLabel?: '5.5' | '5.4' | '5.3' | 'o3';
    includeModelTrigger?: boolean;
    includeModelOption?: '5.5' | '5.4' | '5.3' | 'o3' | null;
    staleReasoningSelectionAfterClick?: boolean;
} = {}): { button: HTMLElement; readState: () => { modelId: string; reasoning: ChatGptReasoningLevel } } {
    let selectedReasoning = options.selectedReasoning ?? '高级';
    let visibleReasoning = selectedReasoning;
    let selectedModelLabel = options.selectedModelLabel ?? '5.5';
    const includeModelTrigger = options.includeModelTrigger ?? true;
    const includeModelOption = options.includeModelOption ?? undefined;
    const staleReasoningSelectionAfterClick = options.staleReasoningSelectionAfterClick ?? false;

    document.body.innerHTML = '<button class="__composer-pill" aria-haspopup="menu" type="button"></button>';
    const btn = document.querySelector<HTMLElement>('button.__composer-pill[aria-haspopup="menu"]')!;
    const reasoningLevels = options.reasoningLevels ?? ['极速', '均衡', '高级'];
    const modelLabels: Array<'5.5' | '5.4' | '5.3' | 'o3'> = ['5.5', '5.4', '5.3', 'o3'];
    let modelMenuOpen = false;

    const updateButtonText = () => {
        btn.textContent = visibleReasoning;
    };

    const removeMenus = () => {
        document.getElementById('mock-chatgpt-pill-menu')?.remove();
        document.getElementById('mock-chatgpt-model-menu')?.remove();
    };

    const closeMenus = () => {
        modelMenuOpen = false;
        removeMenus();
    };

    const renderMenus = () => {
        removeMenus();
        const menu = document.createElement('div');
        menu.id = 'mock-chatgpt-pill-menu';
        menu.setAttribute('role', 'menu');

        for (const level of reasoningLevels) {
            const item = document.createElement('div');
            item.setAttribute('role', 'menuitemradio');
            item.setAttribute('aria-checked', level === selectedReasoning ? 'true' : 'false');
            item.textContent = level;
            item.addEventListener('pointerdown', () => {
                visibleReasoning = level;
                if (!staleReasoningSelectionAfterClick) {
                    selectedReasoning = level;
                }
                updateButtonText();
                closeMenus();
            });
            menu.appendChild(item);
        }

        if (includeModelTrigger) {
            const modelTrigger = document.createElement('div');
            modelTrigger.setAttribute('role', 'menuitem');
            modelTrigger.setAttribute('aria-haspopup', 'menu');
            modelTrigger.setAttribute('aria-controls', 'mock-chatgpt-model-menu');
            modelTrigger.textContent = /^\d/.test(selectedModelLabel) ? `GPT-${selectedModelLabel}` : selectedModelLabel;
            modelTrigger.addEventListener('pointerdown', () => {
                modelMenuOpen = !modelMenuOpen;
                renderMenus();
            });
            menu.appendChild(modelTrigger);
        }

        document.body.appendChild(menu);

        if (includeModelTrigger && modelMenuOpen) {
            const submenu = document.createElement('div');
            submenu.id = 'mock-chatgpt-model-menu';
            submenu.setAttribute('role', 'menu');

            for (const label of modelLabels) {
                if (includeModelOption !== undefined && includeModelOption !== null && label === includeModelOption) {
                    continue;
                }
                const item = document.createElement('div');
                item.setAttribute('role', 'menuitemradio');
                item.setAttribute('aria-checked', label === selectedModelLabel ? 'true' : 'false');
                item.textContent = label;
                item.addEventListener('pointerdown', () => {
                    selectedModelLabel = label;
                    closeMenus();
                });
                submenu.appendChild(item);
            }
            document.body.appendChild(submenu);
        }
    };

    updateButtonText();
    btn.addEventListener('pointerdown', () => {
        if (document.getElementById('mock-chatgpt-pill-menu')) {
            closeMenus();
            return;
        }
        renderMenus();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });

    return {
        button: btn,
        readState: () => ({
            modelId: /^\d/.test(selectedModelLabel) ? `gpt-${selectedModelLabel}` : selectedModelLabel,
            reasoning: visibleReasoning
        })
    };
}

type GeminiThinkingLevel = '标准' | '扩展';

/**
 * 挂载 Gemini 顶层模型菜单 + 「思考等级」子菜单。
 * 真实结构要点：
 * - 顶层模型项：gem-menu-item[role="menuitem"][data-mode-id]
 * - 思考等级入口：gem-menu-item[value="thinking_level"][aria-controls]
 * - 子菜单项：#<aria-controls> gem-menu-item[role="menuitem"]
 */
function mountGeminiModelPicker(options: {
    selectedModelId?: string;
    selectedThinkingLevel?: GeminiThinkingLevel;
    includeThinkingTrigger?: boolean;
    includeExtendedOption?: boolean;
} = {}): { button: HTMLElement; readState: () => { modelId: string; thinkingLevel: GeminiThinkingLevel } } {
    let selectedModelId = options.selectedModelId ?? 'fbb127bbb056c959';
    let selectedThinkingLevel = options.selectedThinkingLevel ?? '标准';
    const includeThinkingTrigger = options.includeThinkingTrigger ?? true;
    const includeExtendedOption = options.includeExtendedOption ?? true;

    document.body.innerHTML = '<button data-test-id="bard-mode-menu-button" type="button"></button>';
    const btn = document.querySelector<HTMLElement>('[data-test-id="bard-mode-menu-button"]')!;
    const models = [
        { id: 'cf41b0e0dd7d53e5', name: '3.1 Flash-Lite', triggerLabel: 'Flash-Lite' },
        { id: 'fbb127bbb056c959', name: '3.5 Flash', triggerLabel: 'Flash' },
        { id: '9d8ca3786ebdfbea', name: '3.1 Pro', triggerLabel: 'Pro' }
    ];
    let thinkingMenuOpen = false;

    const updateButtonText = () => {
        const active = models.find((m) => m.id === selectedModelId) ?? models[1];
        btn.textContent = active.triggerLabel;
    };

    const removeMenus = () => {
        for (const el of document.querySelectorAll('[data-testid="mock-gemini-mode-menu"], #gem-thinking-menu')) {
            el.remove();
        }
    };

    const closeMenus = () => {
        thinkingMenuOpen = false;
        removeMenus();
    };

    const renderMenus = () => {
        removeMenus();
        const menu = document.createElement('div');
        menu.setAttribute('data-testid', 'mock-gemini-mode-menu');

        for (const m of models) {
            const item = document.createElement('gem-menu-item');
            item.setAttribute('role', 'menuitem');
            item.setAttribute('data-mode-id', m.id);
            item.setAttribute('aria-disabled', 'false');
            const content = document.createElement('gem-menu-item-content');
            if (m.id === selectedModelId) {
                item.classList.add('selected');
                content.classList.add('selected');
            }
            const label = document.createElement('span');
            label.className = 'label';
            label.textContent = ` ${m.name} `;
            content.appendChild(label);
            item.appendChild(content);
            item.addEventListener('pointerdown', () => {
                selectedModelId = m.id;
                closeMenus();
                updateButtonText();
            });
            menu.appendChild(item);
        }

        if (includeThinkingTrigger) {
            const trigger = document.createElement('gem-menu-item');
            trigger.setAttribute('role', 'menuitem');
            trigger.setAttribute('value', 'thinking_level');
            trigger.setAttribute('aria-haspopup', 'true');
            trigger.setAttribute('aria-controls', 'gem-thinking-menu');
            trigger.setAttribute('aria-disabled', 'false');
            if (thinkingMenuOpen) {
                trigger.setAttribute('aria-expanded', 'true');
            }
            const content = document.createElement('gem-menu-item-content');
            const label = document.createElement('span');
            label.className = 'label';
            label.textContent = ' 思考等级 ';
            const sublabel = document.createElement('div');
            sublabel.className = 'sublabel';
            sublabel.textContent = selectedThinkingLevel;
            content.appendChild(label);
            content.appendChild(sublabel);
            trigger.appendChild(content);
            trigger.addEventListener('pointerdown', () => {
                thinkingMenuOpen = true;
                renderMenus();
            });
            menu.appendChild(trigger);
        }

        document.body.appendChild(menu);

        if (includeThinkingTrigger && thinkingMenuOpen) {
            const submenu = document.createElement('div');
            submenu.id = 'gem-thinking-menu';
            const levels: GeminiThinkingLevel[] = includeExtendedOption ? ['标准', '扩展'] : ['标准'];
            for (const level of levels) {
                const item = document.createElement('gem-menu-item');
                item.setAttribute('role', 'menuitem');
                item.setAttribute('aria-disabled', 'false');
                const content = document.createElement('gem-menu-item-content');
                if (level === selectedThinkingLevel) {
                    item.classList.add('selected');
                    content.classList.add('selected');
                }
                const label = document.createElement('span');
                label.className = 'label';
                label.textContent = ` ${level} `;
                content.appendChild(label);
                item.appendChild(content);
                item.addEventListener('pointerdown', () => {
                    selectedThinkingLevel = level;
                    closeMenus();
                });
                submenu.appendChild(item);
            }
            document.body.appendChild(submenu);
        }
    };

    updateButtonText();
    btn.addEventListener('pointerdown', () => {
        if (document.querySelector('[data-testid="mock-gemini-mode-menu"]')) {
            closeMenus();
            return;
        }
        renderMenus();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });

    return {
        button: btn,
        readState: () => ({ modelId: selectedModelId, thinkingLevel: selectedThinkingLevel })
    };
}

describe('readAvailableModels — chatgpt', () => {
    it('reads model submenu entries from the ChatGPT pill menu', async () => {
        mountChatgptPillMenu();
        const models = await readAvailableModels(document, 'chatgpt');
        expect(models).toEqual([
            { id: 'gpt-5.5', name: 'GPT-5.5' },
            { id: 'gpt-5.4', name: 'GPT-5.4' },
            { id: 'gpt-5.3', name: 'GPT-5.3' },
            { id: 'o3', name: 'o3' }
        ]);
    });

    it('skips English reasoning items and only returns model submenu entries', async () => {
        mountChatgptPillMenu({
            selectedReasoning: 'Fast',
            reasoningLevels: ['Fast', 'Balanced', 'Thinking']
        });
        const models = await readAvailableModels(document, 'chatgpt');
        expect(models).toEqual([
            { id: 'gpt-5.5', name: 'GPT-5.5' },
            { id: 'gpt-5.4', name: 'GPT-5.4' },
            { id: 'gpt-5.3', name: 'GPT-5.3' },
            { id: 'o3', name: 'o3' }
        ]);
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
    it('switches to a non-selected model via the submenu', async () => {
        const mock = mountChatgptPillMenu({ selectedModelLabel: '5.5' });
        const result = await setActiveModel(document, 'chatgpt', 'gpt-5.4');
        expect(result.ok).toBe(true);
        expect(result.note).toBe('switched-to:gpt-5.4');
        expect(mock.readState().modelId).toBe('gpt-5.4');
    });

    it('is idempotent when the requested model is already selected', async () => {
        mountChatgptPillMenu({ selectedModelLabel: '5.4' });
        const result = await setActiveModel(document, 'chatgpt', 'gpt-5.4');
        expect(result).toEqual({ ok: true, note: 'already-selected' });
    });

    it('reports chatgpt-model-trigger-not-found when the pill menu does not expose a model submenu', async () => {
        mountChatgptPillMenu({ includeModelTrigger: false });
        const result = await setActiveModel(document, 'chatgpt', 'gpt-5.4');
        expect(result.ok).toBe(false);
        expect(result.note).toBe('chatgpt-model-trigger-not-found');
    });

    it('reports chatgpt-model-not-in-picker when the requested model is absent from the submenu', async () => {
        mountChatgptPillMenu({ selectedModelLabel: '5.5', includeModelOption: '5.4' });
        const result = await setActiveModel(document, 'chatgpt', 'gpt-5.4');
        expect(result.ok).toBe(false);
        expect(result.note).toBe('chatgpt-model-not-in-picker:gpt-5.4');
    });
});

describe('setActiveModel — gemini', () => {
    it('switches to a non-selected model by data-mode-id', async () => {
        const mock = mountGeminiModelPicker({ selectedModelId: 'fbb127bbb056c959' });
        const result = await setActiveModel(document, 'gemini', '9d8ca3786ebdfbea');
        expect(result.ok).toBe(true);
        expect(result.note).toBe('switched-to:9d8ca3786ebdfbea');
        expect(mock.readState().modelId).toBe('9d8ca3786ebdfbea');
    });

    it('is idempotent when the requested model is already selected', async () => {
        mountGeminiModelPicker({ selectedModelId: '9d8ca3786ebdfbea' });
        const result = await setActiveModel(document, 'gemini', '9d8ca3786ebdfbea');
        expect(result).toEqual({ ok: true, note: 'already-selected' });
    });
});

describe('setReasoningEffort — chatgpt', () => {
    it('switches to 高级 for high via __composer-pill', async () => {
        const mock = mountChatgptPillMenu({ selectedReasoning: '极速', selectedModelLabel: '5.5' });
        const result = await setReasoningEffort(document, 'chatgpt', 'high');
        expect(result.ok).toBe(true);
        expect(result.note).toBe('set-reasoning:advanced');
        expect(mock.readState()).toEqual({ modelId: 'gpt-5.5', reasoning: '高级' });
    });

    it('switches to 均衡 for medium without changing the model', async () => {
        const mock = mountChatgptPillMenu({ selectedReasoning: '极速', selectedModelLabel: '5.4' });
        const result = await setReasoningEffort(document, 'chatgpt', 'medium');
        expect(result.ok).toBe(true);
        expect(result.note).toBe('set-reasoning:balanced');
        expect(mock.readState()).toEqual({ modelId: 'gpt-5.4', reasoning: '均衡' });
    });

    it('switches to 极速 for low via __composer-pill', async () => {
        const mock = mountChatgptPillMenu({ selectedReasoning: '高级', selectedModelLabel: 'o3' });
        const result = await setReasoningEffort(document, 'chatgpt', 'low');
        expect(result.ok).toBe(true);
        expect(result.note).toBe('set-reasoning:fast');
        expect(mock.readState()).toEqual({ modelId: 'o3', reasoning: '极速' });
    });

    it('switches an English reasoning menu without changing the model', async () => {
        const mock = mountChatgptPillMenu({
            selectedReasoning: 'Fast',
            reasoningLevels: ['Fast', 'Balanced', 'Thinking'],
            selectedModelLabel: '5.4'
        });
        const result = await setReasoningEffort(document, 'chatgpt', 'high');
        expect(result.ok).toBe(true);
        expect(result.note).toBe('set-reasoning:advanced');
        expect(mock.readState()).toEqual({ modelId: 'gpt-5.4', reasoning: 'Thinking' });
    });

    it('treats the pill label as success when the menu aria state is stale after click', async () => {
        const mock = mountChatgptPillMenu({
            selectedReasoning: '高级',
            selectedModelLabel: '5.5',
            staleReasoningSelectionAfterClick: true
        });
        const result = await setReasoningEffort(document, 'chatgpt', 'low');
        expect(result.ok).toBe(true);
        expect(result.note).toBe('set-reasoning:fast');
        expect(mock.button.textContent).toBe('极速');
        expect(mock.readState()).toEqual({ modelId: 'gpt-5.5', reasoning: '极速' });
    });

    it('is idempotent when target is already selected', async () => {
        mountChatgptPillMenu({ selectedReasoning: '高级' });
        const result = await setReasoningEffort(document, 'chatgpt', 'high');
        expect(result).toEqual({ ok: true, note: 'already-selected' });
    });

    it('reports failure when pill button is absent', async () => {
        setBody('<div></div>');
        const result = await setReasoningEffort(document, 'chatgpt', 'high');
        expect(result.ok).toBe(false);
        expect(result.note).toBe('reasoning-picker-not-found');
    });
});

describe('setReasoningEffort — gemini', () => {
    it('switches Gemini thinking level to 扩展 for high effort without changing the model', async () => {
        const mock = mountGeminiModelPicker({ selectedModelId: 'fbb127bbb056c959', selectedThinkingLevel: '标准' });
        const result = await setReasoningEffort(document, 'gemini', 'high');
        expect(result.ok).toBe(true);
        expect(result.note).toBe('set-reasoning:extended');
        expect(mock.readState()).toEqual({ modelId: 'fbb127bbb056c959', thinkingLevel: '扩展' });
    });

    it('maps medium to 标准 and leaves the model unchanged', async () => {
        const mock = mountGeminiModelPicker({ selectedModelId: '9d8ca3786ebdfbea', selectedThinkingLevel: '扩展' });
        const result = await setReasoningEffort(document, 'gemini', 'medium');
        expect(result.ok).toBe(true);
        expect(result.note).toBe('set-reasoning:standard');
        expect(mock.readState()).toEqual({ modelId: '9d8ca3786ebdfbea', thinkingLevel: '标准' });
    });

    it('is idempotent when 标准 is already selected for low effort', async () => {
        mountGeminiModelPicker({ selectedThinkingLevel: '标准' });
        const result = await setReasoningEffort(document, 'gemini', 'low');
        expect(result).toEqual({ ok: true, note: 'already-selected' });
    });

    it('reports missing thinking trigger when the model menu does not expose the submenu', async () => {
        mountGeminiModelPicker({ includeThinkingTrigger: false });
        const result = await setReasoningEffort(document, 'gemini', 'high');
        expect(result.ok).toBe(false);
        expect(result.note).toBe('gemini-thinking-trigger-not-found');
    });

    it('reports missing extended option when the submenu does not contain 扩展', async () => {
        mountGeminiModelPicker({ selectedThinkingLevel: '标准', includeExtendedOption: false });
        const result = await setReasoningEffort(document, 'gemini', 'high');
        expect(result.ok).toBe(false);
        expect(result.note).toBe('gemini-thinking-option-not-found:extended');
    });

    it('reports gemini-mode-btn-missing when the mode trigger is absent', async () => {
        setBody('<div></div>');
        const result = await setReasoningEffort(document, 'gemini', 'high');
        expect(result.ok).toBe(false);
        expect(result.note).toBe('gemini-mode-btn-missing');
    });
});

/**
 * Claude effort menu DOM（模型菜单预展开）：
 *   model trigger:  [data-testid="model-selector-dropdown"]
 *   effort trigger: [data-testid="effort-menu-trigger"]（在模型菜单内）
 *   effort options: [data-testid="effort-option-{high|medium|low}"][aria-checked]
 *
 * JSDOM 不执行真实点击，故将菜单结构预先注入 DOM，openMenuRobust 的 waitForSelector
 * 会立即找到 effort trigger；effort option 同理。
 */
function mountClaudeEffortMenu(currentEffort: 'high' | 'medium' | 'low') {
    setBody(`
        <button data-testid="model-selector-dropdown">Claude Sonnet 4.6 · ${currentEffort}</button>
        <div role="menu">
            <button data-testid="effort-menu-trigger">Extended thinking</button>
            <div role="menuitemradio" data-testid="effort-option-high"   aria-checked="${currentEffort === 'high'   ? 'true' : 'false'}">High</div>
            <div role="menuitemradio" data-testid="effort-option-medium" aria-checked="${currentEffort === 'medium' ? 'true' : 'false'}">Medium</div>
            <div role="menuitemradio" data-testid="effort-option-low"    aria-checked="${currentEffort === 'low'    ? 'true' : 'false'}">Low</div>
        </div>
    `);
}

describe('setReasoningEffort — claude', () => {
    it('sets effort to high via model-selector-dropdown → effort-menu-trigger', async () => {
        mountClaudeEffortMenu('low');
        let clicked = false;
        document.querySelector('[data-testid="effort-option-high"]')!.addEventListener('pointerdown', () => { clicked = true; });
        const result = await setReasoningEffort(document, 'claude', 'high');
        expect(result.ok).toBe(true);
        expect(result.note).toBe('set-effort:high');
        expect(clicked).toBe(true);
    });

    it('sets effort to medium (no longer collapsed to low) via effort-option-medium', async () => {
        mountClaudeEffortMenu('low');
        let clicked = false;
        document.querySelector('[data-testid="effort-option-medium"]')!.addEventListener('pointerdown', () => { clicked = true; });
        const result = await setReasoningEffort(document, 'claude', 'medium');
        expect(result.ok).toBe(true);
        expect(result.note).toBe('set-effort:medium');
        expect(clicked).toBe(true);
    });

    it('sets effort to low via model-selector-dropdown → effort-menu-trigger', async () => {
        mountClaudeEffortMenu('high');
        let clicked = false;
        document.querySelector('[data-testid="effort-option-low"]')!.addEventListener('pointerdown', () => { clicked = true; });
        const result = await setReasoningEffort(document, 'claude', 'low');
        expect(result.ok).toBe(true);
        expect(result.note).toBe('set-effort:low');
        expect(clicked).toBe(true);
    });

    it('is idempotent when target effort is already active (already-selected shortcut)', async () => {
        mountClaudeEffortMenu('high');
        const result = await setReasoningEffort(document, 'claude', 'high');
        expect(result).toEqual({ ok: true, note: 'already-selected' });
    });

    it('reports claude-effort-trigger-not-found when model does not expose effort menu (e.g. Haiku)', async () => {
        vi.useFakeTimers();
        try {
            // 模型触发器存在但菜单内无 effort-menu-trigger（该模型不支持扩展思考）。
            setBody('<button data-testid="model-selector-dropdown">Claude Haiku 4.5</button>');
            const promise = setReasoningEffort(document, 'claude', 'high');
            await vi.advanceTimersByTimeAsync(10_000);
            const result = await promise;
            expect(result.ok).toBe(false);
            expect(result.note).toBe('claude-effort-trigger-not-found');
        } finally {
            vi.useRealTimers();
        }
    });

    it('reports claude-model-trigger-not-found when page is not ready', async () => {
        vi.useFakeTimers();
        try {
            setBody('<div></div>');
            const promise = setReasoningEffort(document, 'claude', 'high');
            await vi.advanceTimersByTimeAsync(20_000);
            const result = await promise;
            expect(result.ok).toBe(false);
            expect(result.note).toBe('claude-model-trigger-not-found');
        } finally {
            vi.useRealTimers();
        }
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
