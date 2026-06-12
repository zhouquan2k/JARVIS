/**
 * 浏览器侧入口：把 domChat 共享逻辑挂到 window.__domChat，供独立实时探针注入使用。
 * 探针通过 esbuild 把本文件打成 IIFE，用 page.addInitScript 注入真实站点页面，
 * 从而验证「与线上 preload 完全相同」的注入/提取/结束检测逻辑。
 */
import { injectPrompt, observeReply } from './domChatObserver';
import {
    findEnabledSendButton,
    findInput,
    isGenerating,
    readAvailableModels,
    readLatestReply,
    setActiveModel,
    setReasoningEffort,
    type DomChatProvider,
    type DomModelInfo,
    type ReasoningEffort
} from './domChatCore';

declare global {
    interface Window {
        __domChat?: {
            injectPrompt: typeof injectPrompt;
            observeReply: typeof observeReply;
            readLatestReply: typeof readLatestReply;
            isGenerating: typeof isGenerating;
            findInput: typeof findInput;
            findEnabledSendButton: typeof findEnabledSendButton;
            readAvailableModels: (provider: DomChatProvider) => Promise<DomModelInfo[]>;
            setActiveModel: (provider: DomChatProvider, modelId: string) => Promise<{ ok: boolean; note: string }>;
            setReasoningEffort: (provider: DomChatProvider, effort: ReasoningEffort) => Promise<{ ok: boolean; note: string }>;
        };
        /** 探针专用：启动观察循环，把流式快照/结束回调桥接到 Playwright exposeFunction。 */
        __domChatObserve?: (provider: DomChatProvider) => void;
        __probeSnapshot?: (text: string) => void;
        __probeDone?: (text: string, reason: string) => void;
    }
}

window.__domChat = {
    injectPrompt,
    observeReply,
    readLatestReply,
    isGenerating,
    findInput,
    findEnabledSendButton,
    readAvailableModels: (provider: DomChatProvider) => readAvailableModels(document, provider),
    setActiveModel: (provider: DomChatProvider, modelId: string) => setActiveModel(document, provider, modelId),
    setReasoningEffort: (provider: DomChatProvider, effort: ReasoningEffort) => setReasoningEffort(document, provider, effort)
};

// 页面内驱动逻辑放在这个干净打包的入口里（避免 tsx 把内联 evaluate 函数注入 __name 辅助）。
// 拆成「注入（返回结果，便于 Node 侧观测）」与「观察（通过 exposeFunction 回调）」两步。
window.__domChatObserve = (provider: DomChatProvider): void => {
    const snapshot = window.__probeSnapshot ?? (() => {});
    const done = window.__probeDone ?? (() => {});
    observeReply(document, provider, {
        onSnapshot: (text) => snapshot(text),
        onDone: (text, reason) => done(text, reason)
    });
};

export type { DomChatProvider };
