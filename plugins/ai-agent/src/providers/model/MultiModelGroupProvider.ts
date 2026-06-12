import { APP_CONFIG, type ProviderModelCatalog } from '@packages/core/config';
import type { IModelProvider, ProviderSendResult, ProviderStreamUpdate, ReasoningEffort, SendMessageOptions } from '../../interfaces/IModelProvider';
import type { GroupConfig, GroupMember } from '../../group/groupTypes';
import { parseMentions } from '../../group/mentionParser';
import { composeMemberPrompt } from '../../group/groupPrompt';

export interface MultiModelGroupProviderDeps {
    resolveMemberProvider(providerId: string): IModelProvider;
    getGroupConfig(presetModelId?: string): GroupConfig;
}

export class MultiModelGroupProvider implements IModelProvider {
    readonly id = 'group';

    private readonly deps: MultiModelGroupProviderDeps;
    private activeMemberProviders: IModelProvider[] = [];

    constructor(deps: MultiModelGroupProviderDeps) {
        this.deps = deps;
    }

    async getAvailableModels(): Promise<ProviderModelCatalog> {
        const providerConfig = APP_CONFIG.providers.find((p) => p.id === 'group');
        if (!providerConfig) {
            return { models: [], defaultModel: '' };
        }
        return {
            models: providerConfig.models.map((m) => ({ ...m })),
            defaultModel: providerConfig.defaultModel
        };
    }

    async checkAuth(): Promise<boolean> {
        return true;
    }

    /**
     * 本轮参与成员：优先用调用方传入的勾选结果（options.groupMembers），
     * 否则回退到默认预设（deps.getGroupConfig）。
     */
    private resolveConfig(options: { modelId?: string; groupMembers?: GroupMember[] }): GroupConfig {
        if (options.groupMembers && options.groupMembers.length > 0) {
            return { members: options.groupMembers };
        }
        return this.deps.getGroupConfig(options.modelId);
    }

    /**
     * 切到 group 时初始化同步：把统一推理档位下发给每个成员受控页面。
     * 成员各自用自己的 modelId（preset 通常为 'dom'，不切模型只设档位）。best-effort。
     */
    async applyPageDefaults(options: { modelId?: string; reasoningEffort?: ReasoningEffort; groupMembers?: GroupMember[] }): Promise<void> {
        const config = this.resolveConfig(options);
        await Promise.all(
            config.members.map(async (member) => {
                const memberProvider = this.deps.resolveMemberProvider(member.providerId);
                await memberProvider.applyPageDefaults?.({
                    modelId: member.modelId,
                    reasoningEffort: options.reasoningEffort
                });
            })
        );
    }

    async sendMessage(
        prompt: string,
        options: SendMessageOptions,
        onUpdate: (update: ProviderStreamUpdate) => void
    ): Promise<ProviderSendResult> {
        const config = this.resolveConfig(options);
        const { targets } = parseMentions(prompt, config.members);

        const buffers: Map<string, string> = new Map(targets.map((m) => [m.name, '']));
        const completedMembers = new Set<string>();
        this.activeMemberProviders = [];

        const memberOrder = targets.map((m) => m.name);

        const buildTranscript = (): string => {
            return memberOrder
                .map((name) => {
                    const content = buffers.get(name) ?? '';
                    if (content === '' && !completedMembers.has(name)) {
                        return `### ${name}\n*正在输入...*`;
                    }
                    return `### ${name}\n${content}`;
                })
                .join('\n\n');
        };

        const memberTasks = targets.map((member) => {
            const memberProvider = this.deps.resolveMemberProvider(member.providerId);
            this.activeMemberProviders.push(memberProvider);

            // 注入 openteam 式群聊提示词（名册 + 自我身份 + 上一轮他人发言）。
            // 经 prompt 文本传递，确保仅读 prompt 的 DomAutomationProvider 也能感知群聊与他人发言。
            const memberPrompt = composeMemberPrompt(member, config.members, options.history, prompt);

            const sendPromise = memberProvider.sendMessage(
                memberPrompt,
                { ...options, modelId: member.modelId },
                (chunk: ProviderStreamUpdate) => {
                    // onUpdate 契约为「全量快照」（store 端 lastMsg.content = update.text），
                    // 各成员的 chunk.text 已是该成员完整文本，直接替换，切勿累加。
                    buffers.set(member.name, chunk.text);
                    onUpdate({ text: buildTranscript() });
                }
            );

            return sendPromise.finally(() => {
                completedMembers.add(member.name);
                onUpdate({ text: buildTranscript() });
            });
        });

        await Promise.all(memberTasks);

        const finalText = buildTranscript();
        return {
            text: finalText,
            conversationId: 'group',
            messageId: `group-${Date.now()}`
        };
    }

    abort(): void {
        for (const provider of this.activeMemberProviders) {
            provider.abort();
        }
        this.activeMemberProviders = [];
    }
}

export function resolveGroupMembers(
    presetModelId: string
): GroupMember[] {
    const groupPresets = APP_CONFIG.groupPresets as Record<string, GroupMember[]> | undefined;
    return groupPresets?.[presetModelId] ?? [];
}

/** 群聊全部候选成员（顶部勾选区展示用，含默认未勾选项）。 */
export function resolveGroupCandidates(): GroupMember[] {
    const candidates = APP_CONFIG.groupCandidates as GroupMember[] | undefined;
    return (candidates ?? []).map((member) => ({ ...member }));
}
