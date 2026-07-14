import { describe, expect, it, vi } from 'vitest';
import { createDomTransport } from './domTransport';
import type { ControlledPageCapability } from '@packages/core';

function makeCapability(): ControlledPageCapability {
    return {
        openControlledPage: vi.fn().mockResolvedValue(undefined),
        evaluateInPage: vi.fn().mockResolvedValue(undefined),
        subscribeControlledPageEvent: vi.fn().mockReturnValue(() => {})
    };
}

const targetUrl = 'https://chatgpt.com';

describe('createDomTransport.open', () => {
    it('reset: forces a fresh conversation by reloading the site home', async () => {
        const capability = makeCapability();
        const transport = createDomTransport({ providerId: 'chatgpt-dom', targetUrl, capability });

        await transport.open({ reset: true });

        expect(capability.openControlledPage).toHaveBeenCalledWith({
            providerId: 'chatgpt-dom',
            targetUrl,
            forceReload: true
        });
    });

    it('continue: reuses the active conversation and never navigates away', async () => {
        const capability = makeCapability();
        const transport = createDomTransport({ providerId: 'chatgpt-dom', targetUrl, capability });

        await transport.open({ reset: false });

        const call = (capability.openControlledPage as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(call).toEqual({ providerId: 'chatgpt-dom', targetUrlIfBlank: targetUrl });
        // 关键：续聊时不得带 targetUrl / forceReload，否则会把 /c/<id> 重载成新对话。
        expect(call.targetUrl).toBeUndefined();
        expect(call.forceReload).toBeUndefined();
    });

    it('defaults to continue mode when no options are passed', async () => {
        const capability = makeCapability();
        const transport = createDomTransport({ providerId: 'chatgpt-dom', targetUrl, capability });

        await transport.open();

        const call = (capability.openControlledPage as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(call.targetUrl).toBeUndefined();
        expect(call.targetUrlIfBlank).toBe(targetUrl);
    });

    it('resume (default): navigates directly to the stored conversation URL in a single load', async () => {
        const capability = makeCapability();
        const resumeUrl = 'https://chatgpt.com/c/abc123';
        const transport = createDomTransport({ providerId: 'chatgpt-dom', targetUrl, capability });

        await transport.open({ resumeUrl });

        expect(capability.openControlledPage).toHaveBeenCalledTimes(1);
        expect(capability.openControlledPage).toHaveBeenCalledWith({ providerId: 'chatgpt-dom', targetUrl: resumeUrl });
        // 直连恢复不预热，不额外 evaluateInPage 等 Service Worker。
        expect(capability.evaluateInPage).not.toHaveBeenCalled();
    });

    it('resume with warm boot (Claude): boots the site home first, waits for SW, then enters the conversation', async () => {
        const capability = makeCapability();
        const claudeHome = 'https://claude.ai/new';
        const resumeUrl = 'https://claude.ai/chat/79c8b9fa';
        const transport = createDomTransport({
            providerId: 'claude-dom',
            targetUrl: claudeHome,
            capability,
            resumeViaWarmBoot: true
        });

        await transport.open({ resumeUrl });

        const openCalls = (capability.openControlledPage as ReturnType<typeof vi.fn>).mock.calls;
        expect(openCalls).toHaveLength(2);
        // 第一步：首页强制重载，热启动 SPA。
        expect(openCalls[0][0]).toEqual({ providerId: 'claude-dom', targetUrl: claudeHome, forceReload: true });
        // 第二步：进入落盘的会话 URL。
        expect(openCalls[1][0]).toEqual({ providerId: 'claude-dom', targetUrl: resumeUrl });
        // 两步之间等待 Service Worker 就绪。
        const swCall = (capability.evaluateInPage as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(swCall.providerId).toBe('claude-dom');
        expect(swCall.script).toContain('serviceWorker');
    });
});

describe('createDomTransport.injectAndSubmit', () => {
    it('does not pass targetUrl so injection never triggers a reload', async () => {
        const capability = makeCapability();
        const transport = createDomTransport({ providerId: 'chatgpt-dom', targetUrl, capability });

        await transport.injectAndSubmit('hello', 'req-1');

        const call = (capability.evaluateInPage as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(call.providerId).toBe('chatgpt-dom');
        expect(call.targetUrl).toBeUndefined();
        expect(call.script).toContain('__jarvisInjectPrompt');
        expect(call.script).toContain('req-1');
    });
});

describe('createDomTransport.readFinalText', () => {
    it('reads the final reply text without triggering navigation', async () => {
        const capability = makeCapability();
        (capability.evaluateInPage as ReturnType<typeof vi.fn>).mockResolvedValueOnce('final reply');
        const transport = createDomTransport({ providerId: 'chatgpt-dom', targetUrl, capability });

        const result = await transport.readFinalText();

        expect(result).toBe('final reply');
        const call = (capability.evaluateInPage as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(call.providerId).toBe('chatgpt-dom');
        expect(call.targetUrl).toBeUndefined();
        expect(call.script).toContain('__jarvisReadReplyText');
    });
});

describe('createDomTransport.readAvailableModels', () => {
    it('opens page with targetUrlIfBlank and calls __jarvisReadAvailableModels', async () => {
        const capability = makeCapability();
        const models = [{ id: 'gpt-4o', name: 'GPT-4o' }];
        // 第一次 evaluateInPage 是诊断探测，第二次才是实际读取模型。
        (capability.evaluateInPage as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({ hasBridge: true, href: 'https://x', readyState: 'complete' })
            .mockResolvedValueOnce(models);
        const transport = createDomTransport({ providerId: 'chatgpt-dom', targetUrl, capability });

        const result = await transport.readAvailableModels();

        expect(result).toEqual(models);
        expect(capability.openControlledPage).toHaveBeenCalledWith({
            providerId: 'chatgpt-dom',
            targetUrlIfBlank: targetUrl
        });
        const readCall = (capability.evaluateInPage as ReturnType<typeof vi.fn>).mock.calls[1][0];
        expect(readCall.script).toContain('__jarvisReadAvailableModels');
    });

    it('returns empty array when evaluateInPage returns non-array', async () => {
        const capability = makeCapability();
        (capability.evaluateInPage as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({ hasBridge: true, href: 'https://x', readyState: 'complete' })
            .mockResolvedValueOnce(null);
        const transport = createDomTransport({ providerId: 'chatgpt-dom', targetUrl, capability });

        const result = await transport.readAvailableModels();

        expect(result).toEqual([]);
    });
});

describe('createDomTransport.setModel', () => {
    it('calls __jarvisSetModel with the modelId in the page', async () => {
        const capability = makeCapability();
        (capability.evaluateInPage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, note: 'switched-to:gpt-4o' });
        const transport = createDomTransport({ providerId: 'chatgpt-dom', targetUrl, capability });

        await transport.setModel('gpt-4o');

        const evalCall = (capability.evaluateInPage as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(evalCall.script).toContain('__jarvisSetModel');
        expect(evalCall.script).toContain('gpt-4o');
        expect(evalCall.providerId).toBe('chatgpt-dom');
    });

    it('throws when the page bridge reports model switching failure', async () => {
        const capability = makeCapability();
        (capability.evaluateInPage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, note: 'model-selection-not-applied:gpt-4o' });
        const transport = createDomTransport({ providerId: 'chatgpt-dom', targetUrl, capability });

        await expect(transport.setModel('gpt-4o')).rejects.toThrow('model-selection-not-applied:gpt-4o');
    });
});

describe('createDomTransport.setReasoningEffort', () => {
    it('passes the effort string through to __jarvisSetReasoningEffort', async () => {
        const capability = makeCapability();
        (capability.evaluateInPage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, note: 'set-reasoning:thinking' });
        const transport = createDomTransport({ providerId: 'chatgpt-dom', targetUrl, capability });

        await transport.setReasoningEffort('high');

        const evalCall = (capability.evaluateInPage as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(evalCall.script).toContain('__jarvisSetReasoningEffort');
        expect(evalCall.script).toContain('"high"');
        expect(evalCall.providerId).toBe('chatgpt-dom');
    });

    it('passes "medium" through verbatim (no boolean collapse)', async () => {
        const capability = makeCapability();
        (capability.evaluateInPage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, note: 'set-reasoning:thinking' });
        const transport = createDomTransport({ providerId: 'chatgpt-dom', targetUrl, capability });

        await transport.setReasoningEffort('medium');

        const evalCall = (capability.evaluateInPage as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(evalCall.script).toContain('"medium"');
    });

    it('throws when the page bridge reports reasoning switching failure', async () => {
        const capability = makeCapability();
        (capability.evaluateInPage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, note: 'gemini-thinking-selection-not-applied:extended' });
        const transport = createDomTransport({ providerId: 'chatgpt-dom', targetUrl, capability });

        await expect(transport.setReasoningEffort('high')).rejects.toThrow('gemini-thinking-selection-not-applied:extended');
    });
});
