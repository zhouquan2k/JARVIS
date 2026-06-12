import { afterEach, describe, expect, it, vi } from 'vitest';
import { DomAutomationProvider } from './DomAutomationProvider';
import type { DomTransport } from './domTransport';
import type { ControlledPageEvent } from '@packages/core/src/interfaces/ControlledPageCapability';

function makeTransport(dynamicModels?: { id: string; name: string }[]): DomTransport & {
    emit: (event: ControlledPageEvent) => void;
    openCalls: Array<{ reset?: boolean } | undefined>;
} {
    let listener: ((event: ControlledPageEvent) => void) | null = null;
    const openCalls: Array<{ reset?: boolean } | undefined> = [];
    return {
        openCalls,
        open: vi.fn(async (openOptions?: { reset?: boolean }) => { openCalls.push(openOptions); }),
        setWebSearch: vi.fn(async () => {}),
        readFinalText: vi.fn(async () => 'final-from-fallback'),
        injectAndSubmit: vi.fn(async () => {}),
        subscribe: vi.fn((onEvent: (event: ControlledPageEvent) => void) => {
            listener = onEvent;
            return () => { listener = null; };
        }),
        readAvailableModels: vi.fn(async () => dynamicModels ?? []),
        setModel: vi.fn(async () => {}),
        setReasoningEffort: vi.fn(async () => {}),
        emit: (event: ControlledPageEvent) => listener?.(event)
    };
}

function makeProvider(dynamicModels?: { id: string; name: string }[]) {
    const transport = makeTransport(dynamicModels);
    const provider = new DomAutomationProvider({ id: 'chatgpt-dom', label: 'ChatGPT (DOM)', transport });
    return { transport, provider };
}

async function drive(provider: DomAutomationProvider, transport: ReturnType<typeof makeTransport>, history?: { role: 'user' | 'assistant'; content: string }[]) {
    const sendPromise = provider.sendMessage('hi', { history }, () => {});
    // 等待 open() + setReasoningEffort() + setWebSearch() + injectAndSubmit() 各自的 await 完成。
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const requestId = (transport.injectAndSubmit as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    transport.emit({ providerId: 'chatgpt-dom', requestId, type: 'done', text: 'answer' });
    return sendPromise;
}

afterEach(() => {
    vi.useRealTimers();
});

describe('DomAutomationProvider session continuity', () => {
    it('first turn (no history) opens a fresh conversation (reset:true)', async () => {
        const { provider, transport } = makeProvider();
        await drive(provider, transport, []);
        expect(transport.openCalls[0]).toEqual({ reset: true });
    });

    it('treats undefined history as first turn (reset:true)', async () => {
        const { provider, transport } = makeProvider();
        await drive(provider, transport, undefined);
        expect(transport.openCalls[0]).toEqual({ reset: true });
    });

    it('follow-up turn (with history) continues the same conversation (reset:false)', async () => {
        const { provider, transport } = makeProvider();
        await drive(provider, transport, [{ role: 'user', content: 'previous' }]);
        expect(transport.openCalls[0]).toEqual({ reset: false });
    });

    it('falls back to reading final text on timeout', async () => {
        vi.useFakeTimers();
        const { provider, transport } = makeProvider();

        const sendPromise = provider.sendMessage('hi', {}, () => {});
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(90_000);

        await expect(sendPromise).resolves.toMatchObject({ text: 'final-from-fallback' });
        expect(transport.readFinalText).toHaveBeenCalledTimes(1);
    });

    it('falls back to reading final text on observer error', async () => {
        const { provider, transport } = makeProvider();

        const sendPromise = provider.sendMessage('hi', {}, () => {});
        // 等到注入发生（open + syncModelAndReasoning + setWebSearch 的 await 链消费完），
        // 不依赖固定微任务计数，避免内部 await 层数变化导致脆弱失败。
        const injectMock = transport.injectAndSubmit as ReturnType<typeof vi.fn>;
        for (let i = 0; i < 20 && injectMock.mock.calls.length === 0; i++) await Promise.resolve();
        const requestId = injectMock.mock.calls[0][1] as string;
        transport.emit({ providerId: 'chatgpt-dom', requestId, type: 'error', message: 'observer failed' });

        await expect(sendPromise).resolves.toMatchObject({ text: 'final-from-fallback' });
        expect(transport.readFinalText).toHaveBeenCalledTimes(1);
    });
});

describe('DomAutomationProvider.getAvailableModels', () => {
    it('returns dynamic models from transport when page exposes them', async () => {
        const { provider } = makeProvider([
            { id: 'gpt-4o', name: 'GPT-4o' },
            { id: 'o3', name: 'o3' }
        ]);
        const catalog = await provider.getAvailableModels();
        expect(catalog.models).toHaveLength(2);
        expect(catalog.models[0].id).toBe('gpt-4o');
        expect(catalog.models[1].id).toBe('o3');
        expect(catalog.defaultModel).toBe('gpt-4o');
    });

    it('throws ModelsNotReadyError when transport returns no models (retryable, not cached as dom)', async () => {
        const { provider } = makeProvider([]);
        await expect(provider.getAvailableModels()).rejects.toMatchObject({ name: 'ModelsNotReadyError' });
    });

    it('throws plain Error (non-retryable) when supportsModelPicker=false, skips readAvailableModels', async () => {
        // 仅覆盖 provider 内部的“静态目录兜底”分支；当前真实 DOM provider 均走动态模型目录。
        const transport = makeTransport([]);
        const provider = new DomAutomationProvider({
            id: 'legacy-dom',
            label: 'Legacy (DOM)',
            transport,
            supportsModelPicker: false
        });
        const error = await provider.getAvailableModels().catch((e: unknown) => e);
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).name).not.toBe('ModelsNotReadyError');
        // 不应调用 transport.readAvailableModels（无需打开受控页面）
        expect(transport.readAvailableModels).not.toHaveBeenCalled();
    });

    it('attaches modelOptions to each dynamic model', async () => {
        const transport = makeTransport([{ id: 'gpt-4o', name: 'GPT-4o' }]);
        const provider = new DomAutomationProvider({
            id: 'chatgpt-dom',
            label: 'ChatGPT (DOM)',
            transport,
            modelOptions: [{ key: 'web_search', label: 'Web search', type: 'boolean', defaultValue: false }]
        });
        const catalog = await provider.getAvailableModels();
        expect(catalog.models[0].options).toHaveLength(1);
        expect(catalog.models[0].options![0].key).toBe('web_search');
    });

    it('attaches defaultReasoningEffort to each dynamic model', async () => {
        const transport = makeTransport([{ id: '9d8ca', name: '3.1 Pro' }]);
        const provider = new DomAutomationProvider({
            id: 'gemini-dom',
            label: 'Gemini (DOM)',
            transport,
            defaultReasoningEffort: 'high'
        });
        const catalog = await provider.getAvailableModels();
        expect(catalog.models[0].reasoningEffort).toBe('high');
    });
});

async function driveWithOptions(
    provider: DomAutomationProvider,
    transport: ReturnType<typeof makeTransport>,
    options: { modelId?: string; reasoningEffort?: 'low' | 'medium' | 'high' }
) {
    const sendPromise = provider.sendMessage('hi', options, () => {});
    // open + (setModel?) + setReasoningEffort + setWebSearch + injectAndSubmit の await を消費
    for (let i = 0; i < 6; i++) await Promise.resolve();
    const calls = (transport.injectAndSubmit as ReturnType<typeof vi.fn>).mock.calls;
    if (calls.length === 0) return sendPromise; // not yet injected
    const requestId = calls[0][1] as string;
    transport.emit({ providerId: 'chatgpt-dom', requestId, type: 'done', text: 'answer' });
    return sendPromise;
}

describe('DomAutomationProvider model switching', () => {
    it('calls transport.setModel when a non-dom modelId is specified', async () => {
        const { provider, transport } = makeProvider();
        await driveWithOptions(provider, transport, { modelId: 'gpt-4o' });
        expect(transport.setModel).toHaveBeenCalledWith('gpt-4o');
    });

    it('skips transport.setModel when modelId is "dom"', async () => {
        const { provider, transport } = makeProvider();
        await driveWithOptions(provider, transport, { modelId: 'dom' });
        expect(transport.setModel).not.toHaveBeenCalled();
    });

    it('skips transport.setModel when no modelId is provided', async () => {
        const { provider, transport } = makeProvider();
        await driveWithOptions(provider, transport, {});
        expect(transport.setModel).not.toHaveBeenCalled();
    });

    it('continues sending even if setModel fails', async () => {
        const transport = makeTransport();
        (transport.setModel as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('picker-not-found'));
        const provider = new DomAutomationProvider({ id: 'chatgpt-dom', label: 'ChatGPT (DOM)', transport });
        const result = await driveWithOptions(provider, transport, { modelId: 'gpt-4o' });
        expect(result).toMatchObject({ text: 'answer' });
    });
});

describe('DomAutomationProvider reasoning effort', () => {
    it('passes "high" through to setReasoningEffort when reasoningEffort is "high"', async () => {
        const { provider, transport } = makeProvider();
        await driveWithOptions(provider, transport, { reasoningEffort: 'high' });
        expect(transport.setReasoningEffort).toHaveBeenCalledWith('high');
    });

    it('passes "low" through to setReasoningEffort when reasoningEffort is "low"', async () => {
        const { provider, transport } = makeProvider();
        await driveWithOptions(provider, transport, { reasoningEffort: 'low' });
        expect(transport.setReasoningEffort).toHaveBeenCalledWith('low');
    });

    it('passes "medium" through (no longer collapsed to low) when reasoningEffort is "medium"', async () => {
        const { provider, transport } = makeProvider();
        await driveWithOptions(provider, transport, { reasoningEffort: 'medium' });
        expect(transport.setReasoningEffort).toHaveBeenCalledWith('medium');
    });

    it('defaults to "high" when reasoningEffort is undefined and no defaultReasoningEffort', async () => {
        const { provider, transport } = makeProvider();
        await driveWithOptions(provider, transport, {});
        expect(transport.setReasoningEffort).toHaveBeenCalledWith('high');
    });

    it('uses defaultReasoningEffort (high) from config when options.reasoningEffort is undefined', async () => {
        const transport = makeTransport();
        const provider = new DomAutomationProvider({
            id: 'chatgpt-dom', label: 'ChatGPT (DOM)', transport, defaultReasoningEffort: 'high'
        });
        await driveWithOptions(provider, transport, {});
        expect(transport.setReasoningEffort).toHaveBeenCalledWith('high');
    });

    it('uses defaultReasoningEffort (low) from config when options.reasoningEffort is undefined', async () => {
        const transport = makeTransport();
        const provider = new DomAutomationProvider({
            id: 'chatgpt-dom', label: 'ChatGPT (DOM)', transport, defaultReasoningEffort: 'low'
        });
        await driveWithOptions(provider, transport, {});
        expect(transport.setReasoningEffort).toHaveBeenCalledWith('low');
    });

    it('options.reasoningEffort overrides defaultReasoningEffort from config', async () => {
        const transport = makeTransport();
        const provider = new DomAutomationProvider({
            id: 'chatgpt-dom', label: 'ChatGPT (DOM)', transport, defaultReasoningEffort: 'low'
        });
        await driveWithOptions(provider, transport, { reasoningEffort: 'high' });
        expect(transport.setReasoningEffort).toHaveBeenCalledWith('high');
    });

    it('continues sending even if setReasoningEffort fails', async () => {
        const transport = makeTransport();
        (transport.setReasoningEffort as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('picker-not-found'));
        const provider = new DomAutomationProvider({ id: 'chatgpt-dom', label: 'ChatGPT (DOM)', transport });
        const result = await driveWithOptions(provider, transport, { reasoningEffort: 'high' });
        expect(result).toMatchObject({ text: 'answer' });
    });
});

describe('DomAutomationProvider.applyPageDefaults', () => {
    it('opens the page (reset:false) and syncs model + reasoning effort without sending', async () => {
        const transport = makeTransport();
        const provider = new DomAutomationProvider({ id: 'gemini-dom', label: 'Gemini (DOM)', transport });
        await provider.applyPageDefaults({ modelId: 'opus-4-8', reasoningEffort: 'high' });

        expect(transport.openCalls[0]).toEqual({ reset: false });
        expect(transport.setModel).toHaveBeenCalledWith('opus-4-8');
        expect(transport.setReasoningEffort).toHaveBeenCalledWith('high');
        // 初始化同步绝不发送消息。
        expect(transport.injectAndSubmit).not.toHaveBeenCalled();
    });

    it('skips setModel when modelId is "dom" but still syncs reasoning effort', async () => {
        const transport = makeTransport();
        const provider = new DomAutomationProvider({ id: 'claude-dom', label: 'Claude (DOM)', transport });
        await provider.applyPageDefaults({ modelId: 'dom', reasoningEffort: 'low' });

        expect(transport.setModel).not.toHaveBeenCalled();
        expect(transport.setReasoningEffort).toHaveBeenCalledWith('low');
    });

    it('falls back to defaultReasoningEffort from config when reasoningEffort is undefined', async () => {
        const transport = makeTransport();
        const provider = new DomAutomationProvider({
            id: 'claude-dom', label: 'Claude (DOM)', transport, defaultReasoningEffort: 'high'
        });
        await provider.applyPageDefaults({ modelId: 'opus-4-8' });

        expect(transport.setReasoningEffort).toHaveBeenCalledWith('high');
    });

    it('does not throw when transport.open fails (best-effort)', async () => {
        const transport = makeTransport();
        (transport.open as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('page-not-ready'));
        const provider = new DomAutomationProvider({ id: 'claude-dom', label: 'Claude (DOM)', transport });
        await expect(provider.applyPageDefaults({ modelId: 'opus-4-8', reasoningEffort: 'high' })).resolves.toBeUndefined();
    });
});
