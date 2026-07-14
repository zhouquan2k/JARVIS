// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { observeReply, waitForConversationSettled } from './domChatObserver';

function setBody(html: string): void {
    document.body.innerHTML = html;
}

/** 刷新 MutationObserver 的微任务投递。 */
async function flushMutations(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

let dispose: (() => void) | null = null;

afterEach(() => {
    dispose?.();
    dispose = null;
    document.body.innerHTML = '';
});

describe('observeReply — 旧答案闪现回归（ChatGPT group 追问轮）', () => {
    it('忽略上一轮旧气泡的重渲染（序列化漂移），仅在出现新气泡后推送本轮内容', async () => {
        // 追问轮起点：页面上已有 1 条旧答案气泡。
        setBody(`
            <div data-message-author-role="user"><div class="markdown">上一问</div></div>
            <div data-message-author-role="assistant"><div class="markdown" id="old">上一轮旧答案</div></div>
        `);

        const snapshots: string[] = [];
        dispose = observeReply(
            document,
            'chatgpt',
            { onSnapshot: (t) => snapshots.push(t), onDone: () => {} },
            { baselineText: '上一轮旧答案', baselineBubbleCount: 1 }
        );

        // 模拟 ChatGPT 在新一轮开始时重渲染旧气泡：内容被序列化漂移（追加一个字符），
        // 但仍未出现新气泡。旧逻辑会把它当成新 chunk 发出，新逻辑必须忽略。
        document.getElementById('old')!.textContent = '上一轮旧答案 ';
        await flushMutations();
        expect(snapshots).toHaveLength(0);

        // 出现真正的新气泡并开始流式输出。
        const fresh = document.createElement('div');
        fresh.setAttribute('data-message-author-role', 'assistant');
        fresh.innerHTML = '<div class="markdown">本轮新答案</div>';
        document.body.appendChild(fresh);
        await flushMutations();

        expect(snapshots.length).toBeGreaterThan(0);
        expect(snapshots[snapshots.length - 1]).toContain('本轮新答案');
        // 任何一帧都不得把旧答案当成本轮回答推送。
        expect(snapshots.some((s) => s.includes('上一轮旧答案'))).toBe(false);
    });

    it('首轮（baselineBubbleCount=0）正常推送第一条气泡内容', async () => {
        setBody(`<div data-message-author-role="user"><div class="markdown">问题</div></div>`);

        const snapshots: string[] = [];
        dispose = observeReply(
            document,
            'chatgpt',
            { onSnapshot: (t) => snapshots.push(t), onDone: () => {} },
            { baselineText: '', baselineBubbleCount: 0 }
        );

        const fresh = document.createElement('div');
        fresh.setAttribute('data-message-author-role', 'assistant');
        fresh.innerHTML = '<div class="markdown">首轮答案</div>';
        document.body.appendChild(fresh);
        await flushMutations();

        expect(snapshots[snapshots.length - 1]).toContain('首轮答案');
    });
});

describe('waitForConversationSettled — resume 水合竞态基线', () => {
    it('等迟渲染的历史气泡补齐后再返回基线（不被低估）', async () => {
        // resume 追问轮刚 loadURL：此刻只渲染出 1 条历史气泡，第 2 条旧答案随后才补上。
        setBody(`
            <div data-message-author-role="user"><div class="markdown">历史问1</div></div>
            <div data-message-author-role="assistant"><div class="markdown">历史答1</div></div>
        `);

        // 稳定窗（150ms）必须明显长于迟渲染延迟（60ms），
        // 否则 settle 会在旧气泡补齐前就返回，测试也会残留未触发的定时器污染后续用例。
        const settledPromise = waitForConversationSettled(document, 'chatgpt', {
            stableWindowMs: 150,
            pollIntervalMs: 20,
            timeoutMs: 3_000
        });

        // 60ms 后补挂第 2 条历史气泡（模拟 SPA 迟渲染），会重置稳定窗。
        setTimeout(() => {
            const late = document.createElement('div');
            late.setAttribute('data-message-author-role', 'assistant');
            late.innerHTML = '<div class="markdown">上一轮旧答案</div>';
            document.body.appendChild(late);
        }, 60);

        const { bubbleCount, text } = await settledPromise;
        // 基线必须等到迟渲染的旧气泡补齐后才定格：数量=2、文本=最后一条旧答案，
        // 从而 observer 的数量门控才能真正拦住旧气泡。
        expect(bubbleCount).toBe(2);
        expect(text).toContain('上一轮旧答案');
    });

    it('已稳定的会话在一个稳定窗后快速返回当前基线', async () => {
        setBody(`
            <div data-message-author-role="user"><div class="markdown">问</div></div>
            <div data-message-author-role="assistant"><div class="markdown">稳定答案</div></div>
        `);

        const { bubbleCount, text } = await waitForConversationSettled(document, 'chatgpt', {
            stableWindowMs: 30,
            pollIntervalMs: 10,
            timeoutMs: 1_000
        });

        expect(bubbleCount).toBe(1);
        expect(text).toContain('稳定答案');
    });
});
