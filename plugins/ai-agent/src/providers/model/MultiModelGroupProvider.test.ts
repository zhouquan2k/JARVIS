import { describe, expect, it, vi } from 'vitest';
import { MultiModelGroupProvider } from './MultiModelGroupProvider';
import type { IModelProvider, ProviderSendResult, ProviderStreamUpdate } from '../../interfaces/IModelProvider';
import type { GroupConfig } from '../../group/groupTypes';

function makeMockProvider(id: string, responseText: string): IModelProvider & { abortCalled: boolean } {
    const mock = {
        id,
        abortCalled: false,
        getAvailableModels: vi.fn().mockResolvedValue({ models: [], defaultModel: '' }),
        checkAuth: vi.fn().mockResolvedValue(true),
        sendMessage: vi.fn(async (_prompt, _options, onUpdate: (u: ProviderStreamUpdate) => void): Promise<ProviderSendResult> => {
            onUpdate({ text: responseText });
            return { text: responseText, conversationId: id, messageId: `${id}-msg` };
        }),
        applyPageDefaults: vi.fn().mockResolvedValue(undefined),
        abort: vi.fn(() => { mock.abortCalled = true; })
    };
    return mock;
}

const members = [
    { providerId: 'chatgpt-codex', modelId: 'auto', name: 'ChatGPT' },
    { providerId: 'gemini-api', modelId: 'gemini-2.5-flash', name: 'Gemini' }
];

function makeProvider(config: GroupConfig) {
    const providers: Record<string, ReturnType<typeof makeMockProvider>> = {
        'chatgpt-codex': makeMockProvider('chatgpt-codex', 'Hello from ChatGPT'),
        'gemini-api': makeMockProvider('gemini-api', 'Hello from Gemini')
    };

    const group = new MultiModelGroupProvider({
        resolveMemberProvider: (id) => providers[id],
        getGroupConfig: () => config
    });

    return { group, providers };
}

describe('MultiModelGroupProvider', () => {
    it('broadcast — dispatches to all members and merges transcript', async () => {
        const { group } = makeProvider({ members });
        const updates: string[] = [];
        const result = await group.sendMessage('Tell me something', {}, (u) => updates.push(u.text));

        expect(result.text).toContain('### ChatGPT');
        expect(result.text).toContain('Hello from ChatGPT');
        expect(result.text).toContain('### Gemini');
        expect(result.text).toContain('Hello from Gemini');
    });

    it('treats member onUpdate as full snapshot (replace, not accumulate)', async () => {
        const providers: Record<string, ReturnType<typeof makeMockProvider>> = {
            'chatgpt-codex': makeMockProvider('chatgpt-codex', 'ignored'),
            'gemini-api': makeMockProvider('gemini-api', 'ignored')
        };
        // ChatGPT 成员发多次「全量快照」（逐步增长），不应被拼接成重复文本。
        providers['chatgpt-codex'].sendMessage = vi.fn(async (_p, _o, onUpdate) => {
            onUpdate({ text: 'New' });
            onUpdate({ text: 'New York' });
            onUpdate({ text: 'New York City' });
            return { text: 'New York City', conversationId: 'chatgpt-codex', messageId: 'c-msg' };
        });
        providers['gemini-api'].sendMessage = vi.fn(async (_p, _o, onUpdate) => {
            onUpdate({ text: 'Toronto' });
            return { text: 'Toronto', conversationId: 'gemini-api', messageId: 'g-msg' };
        });

        const group = new MultiModelGroupProvider({
            resolveMemberProvider: (id) => providers[id],
            getGroupConfig: () => ({ members })
        });

        const updates: string[] = [];
        const result = await group.sendMessage('a city', {}, (u) => updates.push(u.text));

        // 最终文本只含一次「New York City」，绝不出现累加形态。
        expect(result.text).toContain('### ChatGPT\nNew York City');
        expect(result.text).not.toContain('NewNew York');
        expect(result.text).not.toContain('New York CityNew');
        expect(result.text).toContain('### Gemini\nToronto');
        // 任一中间帧也不得包含累加痕迹。
        expect(updates.some((u) => u.includes('NewNew'))).toBe(false);
    });

    it('@mention targeting — only mentioned member answers', async () => {
        const { group, providers } = makeProvider({ members });
        await group.sendMessage('@ChatGPT explain closures', {}, () => {});

        expect(providers['chatgpt-codex'].sendMessage).toHaveBeenCalledTimes(1);
        expect(providers['gemini-api'].sendMessage).not.toHaveBeenCalled();
    });

    it('@mention — multiple members dispatched concurrently', async () => {
        const { group, providers } = makeProvider({ members });
        await group.sendMessage('@ChatGPT @Gemini compare generics', {}, () => {});

        expect(providers['chatgpt-codex'].sendMessage).toHaveBeenCalledTimes(1);
        expect(providers['gemini-api'].sendMessage).toHaveBeenCalledTimes(1);
    });

    it('transcript updates maintain stable segment order', async () => {
        const { group } = makeProvider({ members });
        const updates: string[] = [];
        await group.sendMessage('Compare approaches', {}, (u) => updates.push(u.text));

        for (const update of updates) {
            const chatgptIdx = update.indexOf('### ChatGPT');
            const geminiIdx = update.indexOf('### Gemini');
            if (chatgptIdx !== -1 && geminiIdx !== -1) {
                expect(chatgptIdx).toBeLessThan(geminiIdx);
            }
        }
    });

    it('abort fans out to all active member providers', async () => {
        const providers: Record<string, ReturnType<typeof makeMockProvider>> = {
            'chatgpt-codex': makeMockProvider('chatgpt-codex', 'A'),
            'gemini-api': makeMockProvider('gemini-api', 'B')
        };

        let resolveGemini!: () => void;
        const geminiPending = new Promise<void>((res) => { resolveGemini = res; });
        providers['gemini-api'].sendMessage = vi.fn(async (_p, _o, onUpdate) => {
            await geminiPending;
            onUpdate({ text: 'B' });
            return { text: 'B', conversationId: 'gemini-api', messageId: 'g-msg' };
        });

        const group = new MultiModelGroupProvider({
            resolveMemberProvider: (id) => providers[id],
            getGroupConfig: () => ({ members })
        });

        const sendPromise = group.sendMessage('test', {}, () => {});
        group.abort();
        resolveGemini();
        await sendPromise;

        expect(providers['chatgpt-codex'].abort).toHaveBeenCalled();
        expect(providers['gemini-api'].abort).toHaveBeenCalled();
    });

    it('resolves members from the selected preset (options.modelId)', async () => {
        const presets: Record<string, GroupConfig> = {
            'codex-gemini': { members },
            'dom': {
                members: [
                    { providerId: 'chatgpt-dom', modelId: 'dom', name: 'ChatGPT' },
                    { providerId: 'gemini-dom', modelId: 'dom', name: 'Gemini' }
                ]
            }
        };
        const getGroupConfig = vi.fn((presetModelId?: string) => presets[presetModelId ?? 'codex-gemini']);
        const providers: Record<string, ReturnType<typeof makeMockProvider>> = {
            'chatgpt-dom': makeMockProvider('chatgpt-dom', 'Hello from ChatGPT DOM'),
            'gemini-dom': makeMockProvider('gemini-dom', 'Hello from Gemini DOM')
        };
        const group = new MultiModelGroupProvider({
            resolveMemberProvider: (id) => providers[id],
            getGroupConfig
        });

        const result = await group.sendMessage('Tell me something', { modelId: 'dom' }, () => {});

        expect(getGroupConfig).toHaveBeenCalledWith('dom');
        expect(providers['chatgpt-dom'].sendMessage).toHaveBeenCalledTimes(1);
        expect(providers['gemini-dom'].sendMessage).toHaveBeenCalledTimes(1);
        expect(result.text).toContain('Hello from ChatGPT DOM');
        expect(result.text).toContain('Hello from Gemini DOM');
    });

    it('prefers options.groupMembers over the preset (dynamic checkbox selection)', async () => {
        const getGroupConfig = vi.fn(() => ({ members }));
        const providers: Record<string, ReturnType<typeof makeMockProvider>> = {
            'chatgpt-dom': makeMockProvider('chatgpt-dom', 'Hello from ChatGPT DOM'),
            'claude-dom': makeMockProvider('claude-dom', 'Hello from Claude DOM')
        };
        const group = new MultiModelGroupProvider({
            resolveMemberProvider: (id) => providers[id],
            getGroupConfig
        });

        const dynamicMembers = [
            { providerId: 'chatgpt-dom', modelId: 'dom', name: 'ChatGPT' },
            { providerId: 'claude-dom', modelId: 'dom', name: 'Claude' }
        ];
        const result = await group.sendMessage('Tell me something', { groupMembers: dynamicMembers }, () => {});

        // 勾选结果优先：不回退到 getGroupConfig 预设。
        expect(getGroupConfig).not.toHaveBeenCalled();
        expect(providers['chatgpt-dom'].sendMessage).toHaveBeenCalledTimes(1);
        expect(providers['claude-dom'].sendMessage).toHaveBeenCalledTimes(1);
        expect(result.text).toContain('### Claude');
        expect(result.text).toContain('Hello from Claude DOM');
    });

    it('applyPageDefaults — prefers options.groupMembers over the preset', async () => {
        const getGroupConfig = vi.fn(() => ({ members }));
        const providers: Record<string, ReturnType<typeof makeMockProvider>> = {
            'chatgpt-dom': makeMockProvider('chatgpt-dom', 'x'),
            'claude-dom': makeMockProvider('claude-dom', 'y')
        };
        const group = new MultiModelGroupProvider({
            resolveMemberProvider: (id) => providers[id],
            getGroupConfig
        });

        await group.applyPageDefaults({
            reasoningEffort: 'high',
            groupMembers: [
                { providerId: 'chatgpt-dom', modelId: 'dom', name: 'ChatGPT' },
                { providerId: 'claude-dom', modelId: 'dom', name: 'Claude' }
            ]
        });

        expect(getGroupConfig).not.toHaveBeenCalled();
        expect(providers['chatgpt-dom'].applyPageDefaults).toHaveBeenCalledWith({ modelId: 'dom', reasoningEffort: 'high' });
        expect(providers['claude-dom'].applyPageDefaults).toHaveBeenCalledWith({ modelId: 'dom', reasoningEffort: 'high' });
    });

    it('passes same history to all members', async () => {
        const { group, providers } = makeProvider({ members });
        const history = [{ role: 'user' as const, content: 'previous message' }];
        await group.sendMessage('follow-up', { history }, () => {});

        // history 仍透传给各成员（API 成员保留原生多轮处理）。
        expect(providers['chatgpt-codex'].sendMessage).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ history }),
            expect.any(Function)
        );
        expect(providers['gemini-api'].sendMessage).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ history }),
            expect.any(Function)
        );
    });

    it('injects openteam-style group preamble into each member prompt', async () => {
        const { group, providers } = makeProvider({ members });
        await group.sendMessage('follow-up', {}, () => {});

        const chatgptPrompt = (providers['chatgpt-codex'].sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
        expect(chatgptPrompt).toContain('你正在一个 AI 群聊中。');
        expect(chatgptPrompt).toContain('群聊成员：');
        expect(chatgptPrompt).toContain('- ChatGPT');
        expect(chatgptPrompt).toContain('- Gemini');
        expect(chatgptPrompt).toContain('你的身份是「ChatGPT」。');
        expect(chatgptPrompt).toContain('用户最新消息：\nfollow-up');

        const geminiPrompt = (providers['gemini-api'].sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
        expect(geminiPrompt).toContain('你的身份是「Gemini」。');
    });

    it('applyPageDefaults — fans out to all members with each member modelId and the shared reasoning effort', async () => {
        const { group, providers } = makeProvider({ members });
        await group.applyPageDefaults({ modelId: 'dom', reasoningEffort: 'high' });

        // 统一档位下发；成员各自用自己的 modelId。
        expect(providers['chatgpt-codex'].applyPageDefaults).toHaveBeenCalledWith({ modelId: 'auto', reasoningEffort: 'high' });
        expect(providers['gemini-api'].applyPageDefaults).toHaveBeenCalledWith({ modelId: 'gemini-2.5-flash', reasoningEffort: 'high' });
    });

    it('applyPageDefaults — resolves members from the selected preset (options.modelId)', async () => {
        const presets: Record<string, GroupConfig> = {
            'dom': {
                members: [
                    { providerId: 'chatgpt-dom', modelId: 'dom', name: 'ChatGPT' },
                    { providerId: 'gemini-dom', modelId: 'dom', name: 'Gemini' }
                ]
            }
        };
        const getGroupConfig = vi.fn((presetModelId?: string) => presets[presetModelId ?? 'dom']);
        const providers: Record<string, ReturnType<typeof makeMockProvider>> = {
            'chatgpt-dom': makeMockProvider('chatgpt-dom', 'x'),
            'gemini-dom': makeMockProvider('gemini-dom', 'y')
        };
        const group = new MultiModelGroupProvider({
            resolveMemberProvider: (id) => providers[id],
            getGroupConfig
        });

        await group.applyPageDefaults({ modelId: 'dom', reasoningEffort: 'high' });

        expect(getGroupConfig).toHaveBeenCalledWith('dom');
        expect(providers['chatgpt-dom'].applyPageDefaults).toHaveBeenCalledWith({ modelId: 'dom', reasoningEffort: 'high' });
        expect(providers['gemini-dom'].applyPageDefaults).toHaveBeenCalledWith({ modelId: 'dom', reasoningEffort: 'high' });
    });

    it('feeds previous-round replies from other members (cross-round visibility)', async () => {
        const { group, providers } = makeProvider({ members });
        const history = [
            { role: 'user' as const, content: 'round-1 question' },
            { role: 'assistant' as const, content: '### ChatGPT\nChatGPT round-1 answer\n\n### Gemini\nGemini round-1 answer' }
        ];
        await group.sendMessage('round-2 question', { history }, () => {});

        // Gemini 应看到 ChatGPT 上一轮发言，但不应看到自己的发言被回灌。
        const geminiPrompt = (providers['gemini-api'].sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
        expect(geminiPrompt).toContain('你上次之后，群聊里有这些新内容：');
        expect(geminiPrompt).toContain('ChatGPT：ChatGPT round-1 answer');
        expect(geminiPrompt).not.toContain('Gemini：Gemini round-1 answer');

        // ChatGPT 应看到 Gemini 上一轮发言，但不应看到自己的。
        const chatgptPrompt = (providers['chatgpt-codex'].sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
        expect(chatgptPrompt).toContain('Gemini：Gemini round-1 answer');
        expect(chatgptPrompt).not.toContain('ChatGPT：ChatGPT round-1 answer');
    });
});
