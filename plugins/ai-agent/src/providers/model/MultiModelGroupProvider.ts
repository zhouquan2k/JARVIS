import { APP_CONFIG, type ProviderModelCatalog } from '@packages/core/config';
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

export class MultiModelGroupProvider implements IModelProvider {
    readonly id = 'group';

    private readonly deps: MultiModelGroupProviderDeps;
    private activeMemberProviders: IModelProvider[] = [];
    private activeSummarizerProvider: IModelProvider | null = null;
    private hasActiveSummaryConversation = false;

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
        logGroup('resolve-members', {
            optionsGroupMembers: (options.groupMembers ?? []).map((m) => m.providerId),
            configMembers: config.members.map((m) => m.providerId),
            parsedTargets: targets.map((m) => m.providerId)
        });

        const groupMembers: GroupMemberPart[] = targets.map((m) => ({
            name: m.name,
            providerId: m.providerId,
            modelId: m.modelId,
            content: '',
            status: 'pending'
        }));

        this.activeMemberProviders = [];
        this.activeSummarizerProvider = null;

        const startedAt = Date.now();
        logGroup('send-start', { memberCount: targets.length, members: targets.map((m) => ({ name: m.name, providerId: m.providerId, modelId: m.modelId })) });

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

        const memberTasks = targets.map((member) => {
            const memberProvider = this.deps.resolveMemberProvider(member.providerId);
            this.activeMemberProviders.push(memberProvider);

            const memberPrompt = composeMemberPrompt(member, config.members, options.history, prompt);
            const idx = memberIndexByName.get(member.name)!;
            groupMembers[idx].status = 'streaming';
            logGroup('member-start', { name: member.name, providerId: member.providerId, modelId: member.modelId });
            let firstChunkLogged = false;

            const sendPromise = memberProvider.sendMessage(
                memberPrompt,
                { ...options, modelId: member.modelId },
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
                    logGroup('member-done', { name: member.name, textLen: result.text.length, sinceStartMs: Date.now() - startedAt });
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
                    const summaryHistory = this.hasActiveSummaryConversation
                        ? [{ role: 'user' as const, content: '继续沿用当前总结对话。' }]
                        : undefined;
                    this.hasActiveSummaryConversation = true;

                    await summarizerProvider.sendMessage(
                        summaryPrompt,
                        { modelId: summarizerConfig.modelId, history: summaryHistory },
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
                    logGroup('summary-done', { textLen: groupSummary.content.length, sinceStartMs: Date.now() - startedAt });
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
