import { APP_CONFIG, findPreferredModel, firstPreferredModel, type ProviderModelCatalog } from '@packages/core/config';
import type { IModelProvider, ProviderSendResult, ProviderStreamUpdate, ReasoningEffort, SendMessageOptions } from '../../interfaces/IModelProvider';
import type { GroupMemberPart, GroupSummaryPart } from '../../interfaces/Conversation';
import type { GroupConfig, GroupMember, MultiModelGroupProviderDeps } from '../../group/groupTypes';
import { parseMentions } from '../../group/mentionParser';
import { composeMemberPrompt } from '../../group/groupPrompt';
import { composeGroupSummaryPrompt } from '../../group/groupSummaryPrompt';

function logGroup(stage: string, extra?: Record<string, unknown>): void {
    try {
        console.log('[GroupProvider]', JSON.stringify({ stage, ...extra }));
    } catch {
        // 序列化失败不影响编排
    }
}

/** modelId 已解析为具体模型 id 的成员。 */
type ResolvedGroupMember = Omit<GroupMember, 'modelId'> & { modelId: string };

export class MultiModelGroupProvider implements IModelProvider {
    readonly id = 'group';

    private readonly deps: MultiModelGroupProviderDeps;
    private activeMemberProviders: IModelProvider[] = [];
    private activeSummarizerProvider: IModelProvider | null = null;

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

    private resolveConfig(options: { modelId?: string; groupMembers?: GroupMember[] }): GroupConfig {
        if (options.groupMembers && options.groupMembers.length > 0) {
            return { members: options.groupMembers };
        }
        return this.deps.getGroupConfig(options.modelId);
    }

    /** 把成员 modelId（可能是优先级列表）解析为该成员 provider 目录中第一个可用的具体模型 id。 */
    private async resolveMemberModelId(member: GroupMember): Promise<string> {
        if (!Array.isArray(member.modelId)) {
            return member.modelId;
        }
        if (this.deps.resolveMemberModels) {
            try {
                const catalog = await this.deps.resolveMemberModels(member.providerId);
                const matched = findPreferredModel(catalog.models, member.modelId);
                if (matched) {
                    return matched.id;
                }
            } catch (err) {
                logGroup('resolve-member-model-failed', {
                    providerId: member.providerId,
                    error: err instanceof Error ? err.message : String(err)
                });
            }
        }
        return firstPreferredModel(member.modelId) ?? '';
    }

    private async resolveMembers(members: GroupMember[]): Promise<ResolvedGroupMember[]> {
        return Promise.all(members.map(async (member) => ({
            ...member,
            modelId: await this.resolveMemberModelId(member)
        })));
    }

    async applyPageDefaults(options: { modelId?: string; reasoningEffort?: ReasoningEffort; groupMembers?: GroupMember[] }): Promise<void> {
        const config = this.resolveConfig(options);
        const members = await this.resolveMembers(config.members);
        await Promise.all(
            members.map(async (member) => {
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
        // 先用未解析的 config.members 做 @mention 匹配（只依赖 name），并同步登记
        // activeMemberProviders：确保调用方在 sendMessage 返回的 Promise resolve 前
        // 立刻调用 abort() 时，仍能命中已激活的成员 provider（不被下面的异步模型解析打断）。
        const { targets: unresolvedTargets } = parseMentions(prompt, config.members);
        logGroup('resolve-members', {
            optionsGroupMembers: (options.groupMembers ?? []).map((m) => m.providerId),
            configMembers: config.members.map((m) => m.providerId),
            parsedTargets: unresolvedTargets.map((m) => m.providerId)
        });

        // 快照本轮成员 provider：abort() 可能在下面的异步模型解析期间把 this.activeMemberProviders
        // 清空，memberTasks 需要按这份快照（而非 this.activeMemberProviders）取对应 provider。
        const memberProviders = unresolvedTargets.map((member) => this.deps.resolveMemberProvider(member.providerId));
        this.activeMemberProviders = memberProviders;
        this.activeSummarizerProvider = null;

        const resolvedMembers = await this.resolveMembers(config.members);
        const targetNames = new Set(unresolvedTargets.map((m) => m.name));
        const targets = resolvedMembers.filter((m) => targetNames.has(m.name));

        const groupMembers: GroupMemberPart[] = targets.map((m) => ({
            name: m.name,
            providerId: m.providerId,
            modelId: m.modelId,
            content: '',
            status: 'pending'
        }));

        const startedAt = Date.now();
        logGroup('send-start', {
            memberCount: targets.length,
            members: targets.map((m) => ({ name: m.name, providerId: m.providerId, modelId: m.modelId })),
            hasHistory: (options.history?.length ?? 0) > 0,
            resumeSessions: options.groupMemberSessions ?? null
        });

        const memberIndexByName = new Map(targets.map((m, i) => [m.name, i]));

        const buildTranscript = (): string => {
            return groupMembers
                .map((m) => {
                    if (m.status === 'error') {
                        return `### ${m.name}\n*Error: ${m.error ?? 'unknown error'}*`;
                    }
                    if (m.content === '' && m.status !== 'done') {
                        return `### ${m.name}\n*正在输入...*`;
                    }
                    return `### ${m.name}\n${m.content}`;
                })
                .join('\n\n');
        };

        const memberTasks = targets.map((member, i) => {
            // targets 由 resolvedMembers 按 unresolvedTargets 的 name 过滤而来，顺序与
            // memberProviders（按 unresolvedTargets 同序同步登记的快照）一一对应。
            const memberProvider = memberProviders[i];

            const memberPrompt = composeMemberPrompt(member, resolvedMembers, options.history, prompt);
            const idx = memberIndexByName.get(member.name)!;
            groupMembers[idx].status = 'streaming';
            logGroup('member-start', { name: member.name, providerId: member.providerId, modelId: member.modelId });
            let firstChunkLogged = false;

            const sendPromise = memberProvider.sendMessage(
                memberPrompt,
                { ...options, modelId: member.modelId, resumeConversationUrl: options.groupMemberSessions?.[member.providerId] },
                (chunk: ProviderStreamUpdate) => {
                    if (!firstChunkLogged && chunk.text) {
                        firstChunkLogged = true;
                        logGroup('member-first-chunk', { name: member.name, textLen: chunk.text.length, sinceStartMs: Date.now() - startedAt });
                    }
                    groupMembers[idx].content = chunk.text;
                    groupMembers[idx].status = 'streaming';
                    onUpdate({
                        text: buildTranscript(),
                        groupMembers: groupMembers.map((m) => ({ ...m }))
                    });
                }
            );

            return sendPromise
                .then((result) => {
                    groupMembers[idx].content = result.text;
                    groupMembers[idx].status = 'done';
                    groupMembers[idx].conversationUrl = result.conversationUrl;
                    logGroup('member-done', { name: member.name, textLen: result.text.length, conversationUrl: result.conversationUrl, sinceStartMs: Date.now() - startedAt });
                })
                .catch((err: unknown) => {
                    groupMembers[idx].status = 'error';
                    groupMembers[idx].error = err instanceof Error ? err.message : String(err);
                    logGroup('member-error', { name: member.name, error: groupMembers[idx].error, sinceStartMs: Date.now() - startedAt });
                })
                .finally(() => {
                    onUpdate({
                        text: buildTranscript(),
                        groupMembers: groupMembers.map((m) => ({ ...m }))
                    });
                });
        });

        await Promise.all(memberTasks);

        const successfulMembers = groupMembers.filter((m) => m.status === 'done');
        let groupSummary: GroupSummaryPart | undefined;
        logGroup('members-settled', {
            sinceStartMs: Date.now() - startedAt,
            statuses: groupMembers.map((m) => ({ name: m.name, status: m.status, textLen: m.content.length }))
        });

        if (successfulMembers.length >= 2) {
            const summarizerConfig = this.deps.getSummarizerConfig(options.modelId);
            const summarizerProvider = this.deps.resolveSummarizer(options.modelId);
            logGroup('summary-decision', {
                successfulCount: successfulMembers.length,
                hasSummarizerProvider: Boolean(summarizerProvider),
                hasSummarizerConfig: Boolean(summarizerConfig)
            });

            if (summarizerProvider && summarizerConfig) {
                groupSummary = { phase: 'waiting', content: '' };
                onUpdate({
                    text: buildTranscript(),
                    groupMembers: groupMembers.map((m) => ({ ...m })),
                    groupSummary: { ...groupSummary }
                });

                try {
                    this.activeSummarizerProvider = summarizerProvider;
                    const summaryPrompt = composeGroupSummaryPrompt(successfulMembers, summarizerConfig.systemPrompt);
                    groupSummary.phase = 'streaming';
                    groupSummary.providerId = summarizerConfig.providerId;
                    // 有落盘的总结器会话 URL 时按「恢复轮」发送（history 非空触发续聊 + 导航回原对话）；
                    // 否则首次总结，开全新总结对话。
                    const summarizerResumeUrl = options.groupMemberSessions?.[summarizerConfig.providerId];
                    const summaryHistory = summarizerResumeUrl
                        ? [{ role: 'user' as const, content: '继续沿用当前总结对话。' }]
                        : undefined;

                    const summaryResult = await summarizerProvider.sendMessage(
                        summaryPrompt,
                        { modelId: summarizerConfig.modelId, history: summaryHistory, resumeConversationUrl: summarizerResumeUrl },
                        (chunk: ProviderStreamUpdate) => {
                            groupSummary!.content = chunk.text;
                            groupSummary!.phase = 'streaming';
                            onUpdate({
                                text: buildTranscript(),
                                groupMembers: groupMembers.map((m) => ({ ...m })),
                                groupSummary: { ...groupSummary! }
                            });
                        }
                    );

                    groupSummary.phase = 'done';
                    groupSummary.conversationUrl = summaryResult.conversationUrl;
                    logGroup('summary-done', { textLen: groupSummary.content.length, conversationUrl: summaryResult.conversationUrl, sinceStartMs: Date.now() - startedAt });
                } catch (err: unknown) {
                    groupSummary.phase = 'error';
                    groupSummary.error = err instanceof Error ? err.message : String(err);
                    logGroup('summary-error', { error: groupSummary.error, sinceStartMs: Date.now() - startedAt });
                } finally {
                    this.activeSummarizerProvider = null;
                    onUpdate({
                        text: buildTranscript(),
                        groupMembers: groupMembers.map((m) => ({ ...m })),
                        groupSummary: { ...groupSummary! }
                    });
                }
            }
        }

        const finalText = buildTranscript();
        return {
            text: finalText,
            conversationId: 'group',
            messageId: `group-${Date.now()}`,
            groupMembers: groupMembers.map((m) => ({ ...m })),
            groupSummary: groupSummary ? { ...groupSummary } : undefined
        };
    }

    abort(): void {
        for (const provider of this.activeMemberProviders) {
            provider.abort();
        }
        this.activeMemberProviders = [];

        if (this.activeSummarizerProvider) {
            this.activeSummarizerProvider.abort();
            this.activeSummarizerProvider = null;
        }
    }
}

export function resolveGroupMembers(
    presetModelId: string
): GroupMember[] {
    const groupPresets = APP_CONFIG.groupPresets as Record<string, GroupMember[]> | undefined;
    return groupPresets?.[presetModelId] ?? [];
}

export function resolveGroupCandidates(): GroupMember[] {
    const candidates = APP_CONFIG.groupCandidates as GroupMember[] | undefined;
    return (candidates ?? []).map((member) => ({ ...member }));
}
