// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { observeReply } from './domChatObserver';

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
