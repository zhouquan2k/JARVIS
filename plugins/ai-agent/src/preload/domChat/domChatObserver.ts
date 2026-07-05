/**
 * DOM 实时对话抓取 —— 注入与观察循环（浏览器 API：MutationObserver / 定时器）。
 *
 * 与 domChatCore 一同构成 preload 与独立探针的共享实现，保证「验证的就是线上跑的」。
 */
import {
    type DomChatProvider,
    countReplyBubbles,
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
    /**
     * 调用前页面上已有的最后一条助手回复文本。
     * 设置后 observer 会跳过与基线相同的文本，避免在第 2 轮及之后把上一轮旧答案当成新 chunk 发出。
     */
    baselineText?: string;
    /**
     * 调用前页面上已有的「助手回复气泡」数量。
     * 这是比 baselineText 更强的锚点：在气泡数量超过基线（出现真正的新一轮气泡）之前一律不读取，
     * 从而即使上一轮旧气泡被重渲染导致序列化漂移，也不会被误当成本轮回答发出。
     */
    baselineBubbleCount?: number;
}

export type ReplyDoneReason = 'stable' | 'timeout';

export interface ObserveCallbacks {
    onSnapshot?: (text: string) => void;
    onDone: (text: string, reason: ReplyDoneReason) => void;
}

const OBSERVE_DEFAULTS = {
    stableWindowMs: 2500,
    timeoutMs: 300_000
};

// 阶段一诊断采样间隔：与完成判定无关，仅周期性记录「是否仍在生成 / 当前可提取文本长度」，
// 用于坐实「thinking 阶段无文本变化 → stable 定时器从未武装 → 只能靠 90s 超时」的假设。
const OBSERVE_DIAG_SAMPLE_MS = 1_000;

function logObserve(provider: DomChatProvider, stage: string, extra?: Record<string, unknown>): void {
    try {
        console.log('[DomObserve]', JSON.stringify({ provider, stage, ...extra }));
    } catch {
        // 序列化失败不影响观察循环
    }
}

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
    const baselineBubbleCount = options.baselineBubbleCount;
    const baselineText = options.baselineText;

    // 读取本轮回复，带两道基线门控：
    // 1) 气泡数量门控（主）：出现「新气泡」（数量超过基线）前一律返回空。这是修复「ChatGPT 偶现旧答案
    //    闪现」的关键——新一轮气泡出现前最后一条气泡仍是旧答案，旧气泡重渲染会让序列化文本漂移、绕过
    //    纯文本比对；用气泡数量门控可彻底避免误读旧气泡。
    // 2) 文本门控（兜底）：即便气泡数量变化，若内容仍等于发送前旧答案，也视为尚未产生新内容。
    const readReply = (): string => {
        if (baselineBubbleCount !== undefined && countReplyBubbles(doc, provider) <= baselineBubbleCount) {
            return '';
        }
        const text = readLatestReply(doc, provider);
        if (baselineText !== undefined && text === baselineText) {
            return '';
        }
        return text;
    };

    // lastText 必须从空串起步（而非 baselineText）：否则若新气泡始终未出现，timeout 收尾会把旧答案当成结果返回。
    let lastText = '';
    let stableTimer: ReturnType<typeof setTimeout> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let observer: MutationObserver | null = null;

    // 阶段一诊断状态（与完成判定无关，仅用于日志）。
    const startedAt = Date.now();
    let snapshotCount = 0;
    let lastChangeAt = startedAt;
    let stableArmed = false;
    let diagSampler: ReturnType<typeof setInterval> | null = null;

    logObserve(provider, 'observe-start', { stableWindowMs, timeoutMs, generating: isGenerating(doc, provider) });

    const dispose = () => {
        observer?.disconnect();
        observer = null;
        if (stableTimer) clearTimeout(stableTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (diagSampler) clearInterval(diagSampler);
        stableTimer = null;
        timeoutTimer = null;
        diagSampler = null;
    };

    const finish = (reason: ReplyDoneReason) => {
        if (!observer && reason !== 'timeout') {
            // 已结束
        }
        logObserve(provider, 'finish', {
            reason,
            textLen: lastText.length,
            snapshotCount,
            stableArmed,
            elapsedMs: Date.now() - startedAt,
            sinceLastChangeMs: Date.now() - lastChangeAt
        });
        dispose();
        callbacks.onDone(lastText, reason);
    };

    const scheduleStableCheck = () => {
        stableArmed = true;
        if (stableTimer) clearTimeout(stableTimer);
        stableTimer = setTimeout(() => {
            const generating = isGenerating(doc, provider);
            logObserve(provider, 'stable-tick', { generating, sinceLastChangeMs: Date.now() - lastChangeAt });
            if (generating) {
                scheduleStableCheck();
            } else {
                finish('stable');
            }
        }, stableWindowMs);
    };

    timeoutTimer = setTimeout(() => finish('timeout'), timeoutMs);

    // 独立周期采样：即使 thinking 阶段一直无文本变化（不触发 observer），也能记录
    // generating 状态与可提取文本长度随时间的变化，直接暴露「stable 是否从未武装」。
    diagSampler = setInterval(() => {
        const currentGenerating = isGenerating(doc, provider);
        const replyLen = readReply().length;
        logObserve(provider, 'sample', {
            generating: currentGenerating,
            replyLen,
            snapshotCount,
            stableArmed,
            sinceStartMs: Date.now() - startedAt,
            sinceLastChangeMs: Date.now() - lastChangeAt
        });
        // 安全网：内容已出现且生成已停止，但 MutationObserver 未触发末次变化 → 补充 arm stable 定时器。
        if (!stableArmed && replyLen > 0 && !currentGenerating) {
            logObserve(provider, 'poll-stable-arm', { replyLen });
            scheduleStableCheck();
        }
    }, OBSERVE_DIAG_SAMPLE_MS);

    observer = new MutationObserver(() => {
        const currentText = readReply();
        if (currentText && currentText !== lastText) {
            lastText = currentText;
            snapshotCount += 1;
            lastChangeAt = Date.now();
            if (snapshotCount === 1) {
                logObserve(provider, 'snapshot-first', { textLen: currentText.length, sinceStartMs: lastChangeAt - startedAt });
            }
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
