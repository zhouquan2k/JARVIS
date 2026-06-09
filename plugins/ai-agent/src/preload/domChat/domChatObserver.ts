/**
 * DOM 实时对话抓取 —— 注入与观察循环（浏览器 API：MutationObserver / 定时器）。
 *
 * 与 domChatCore 一同构成 preload 与独立探针的共享实现，保证「验证的就是线上跑的」。
 */
import {
    type DomChatProvider,
    describePageState,
    findEnabledSendButton,
    findInput,
    isGenerating,
    readLatestReply,
    setInputText
} from './domChatCore';

export interface InjectOptions {
    inputWaitMs?: number;
    sendButtonWaitMs?: number;
    pollIntervalMs?: number;
}

export type InjectFailureStage = 'input-not-found' | 'send-button-unavailable';

export interface InjectResult {
    ok: boolean;
    stage?: InjectFailureStage;
    message?: string;
}

const DEFAULTS = {
    inputWaitMs: 10_000,
    sendButtonWaitMs: 5_000,
    pollIntervalMs: 200
};

function waitFor<T>(probe: () => T | null, timeoutMs: number, pollIntervalMs: number): Promise<T | null> {
    return new Promise((resolve) => {
        const deadline = Date.now() + timeoutMs;
        const tick = () => {
            const value = probe();
            if (value) {
                resolve(value);
                return;
            }
            if (Date.now() >= deadline) {
                resolve(null);
                return;
            }
            setTimeout(tick, pollIntervalMs);
        };
        tick();
    });
}

/** 等待输入框出现 → 写入文本 → 等待发送按钮可用 → 点击。返回成功/失败诊断。 */
export async function injectPrompt(
    doc: Document,
    provider: DomChatProvider,
    prompt: string,
    options: InjectOptions = {}
): Promise<InjectResult> {
    const inputWaitMs = options.inputWaitMs ?? DEFAULTS.inputWaitMs;
    const sendButtonWaitMs = options.sendButtonWaitMs ?? DEFAULTS.sendButtonWaitMs;
    const pollIntervalMs = options.pollIntervalMs ?? DEFAULTS.pollIntervalMs;

    const inputEl = await waitFor(() => findInput(doc, provider), inputWaitMs, pollIntervalMs);
    if (!inputEl) {
        return {
            ok: false,
            stage: 'input-not-found',
            message: `input not found (likely not signed in or page not ready) — ${describePageState(doc)}`
        };
    }

    setInputText(inputEl, prompt);

    const sendBtn = await waitFor(() => findEnabledSendButton(doc, provider), sendButtonWaitMs, pollIntervalMs);
    if (!sendBtn) {
        return {
            ok: false,
            stage: 'send-button-unavailable',
            message: `send button unavailable — ${describePageState(doc)}`
        };
    }

    sendBtn.click();
    return { ok: true };
}

export interface ObserveOptions {
    stableWindowMs?: number;
    timeoutMs?: number;
}

export type ReplyDoneReason = 'stable' | 'timeout';

export interface ObserveCallbacks {
    onSnapshot?: (text: string) => void;
    onDone: (text: string, reason: ReplyDoneReason) => void;
}

const OBSERVE_DEFAULTS = {
    stableWindowMs: 2500,
    timeoutMs: 90_000
};

/**
 * 观察助手回复：每次变化推送「完整快照」；仅当确实生成完毕（无停止按钮）且文本稳定才结束，
 * 避免联网搜索暂停时过早结束。返回 dispose 函数。
 */
export function observeReply(
    doc: Document,
    provider: DomChatProvider,
    callbacks: ObserveCallbacks,
    options: ObserveOptions = {}
): () => void {
    const stableWindowMs = options.stableWindowMs ?? OBSERVE_DEFAULTS.stableWindowMs;
    const timeoutMs = options.timeoutMs ?? OBSERVE_DEFAULTS.timeoutMs;

    let lastText = '';
    let stableTimer: ReturnType<typeof setTimeout> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let observer: MutationObserver | null = null;

    const dispose = () => {
        observer?.disconnect();
        observer = null;
        if (stableTimer) clearTimeout(stableTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        stableTimer = null;
        timeoutTimer = null;
    };

    const finish = (reason: ReplyDoneReason) => {
        if (!observer && reason !== 'timeout') {
            // 已结束
        }
        dispose();
        callbacks.onDone(lastText, reason);
    };

    const scheduleStableCheck = () => {
        if (stableTimer) clearTimeout(stableTimer);
        stableTimer = setTimeout(() => {
            if (isGenerating(doc, provider)) {
                scheduleStableCheck();
            } else {
                finish('stable');
            }
        }, stableWindowMs);
    };

    timeoutTimer = setTimeout(() => finish('timeout'), timeoutMs);

    observer = new MutationObserver(() => {
        const currentText = readLatestReply(doc, provider);
        if (currentText && currentText !== lastText) {
            lastText = currentText;
            callbacks.onSnapshot?.(currentText);
            // 仅靠「文本稳定 stableWindowMs 且已停止生成」才结束（最后一次变化已 arm 定时器）。
            // 不在此处因「停止按钮消失」立即结束：ChatGPT 收尾时文本会滞后于按钮状态，立即结束会截断末尾。
            scheduleStableCheck();
        }
    });

    observer.observe(doc.body ?? doc.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
    });

    return dispose;
}
