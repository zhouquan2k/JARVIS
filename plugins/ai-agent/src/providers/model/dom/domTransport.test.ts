import { describe, expect, it, vi } from 'vitest';
import { createDomTransport } from './domTransport';
import type { ControlledPageCapability } from '@packages/core/src/interfaces/ControlledPageCapability';

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
        (capability.evaluateInPage as ReturnType<typeof vi.fn>).mockResolvedValueOnce(models);
        const transport = createDomTransport({ providerId: 'chatgpt-dom', targetUrl, capability });

        const result = await transport.readAvailableModels();

        expect(result).toEqual(models);
        expect(capability.openControlledPage).toHaveBeenCalledWith({
            providerId: 'chatgpt-dom',
            targetUrlIfBlank: targetUrl
        });
        const evalCall = (capability.evaluateInPage as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(evalCall.script).toContain('__jarvisReadAvailableModels');
    });

    it('returns empty array when evaluateInPage returns non-array', async () => {
        const capability = makeCapability();
        (capability.evaluateInPage as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
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
});

describe('createDomTransport.setReasoningEffort', () => {
    it('calls __jarvisSetReasoningEffort with true for high', async () => {
        const capability = makeCapability();
        (capability.evaluateInPage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, note: 'set-reasoning:thinking' });
        const transport = createDomTransport({ providerId: 'chatgpt-dom', targetUrl, capability });

        await transport.setReasoningEffort(true);

        const evalCall = (capability.evaluateInPage as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(evalCall.script).toContain('__jarvisSetReasoningEffort');
        expect(evalCall.script).toContain('true');
        expect(evalCall.providerId).toBe('chatgpt-dom');
    });

    it('calls __jarvisSetReasoningEffort with false for low', async () => {
        const capability = makeCapability();
        (capability.evaluateInPage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, note: 'set-reasoning:instant' });
        const transport = createDomTransport({ providerId: 'chatgpt-dom', targetUrl, capability });

        await transport.setReasoningEffort(false);

        const evalCall = (capability.evaluateInPage as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(evalCall.script).toContain('false');
    });
});
