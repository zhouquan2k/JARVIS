import type { GroupSummarizerConfig, ProviderModelCatalog } from '@packages/core/config';
import type { IModelProvider } from '../interfaces/IModelProvider';

export interface GroupMember {
    providerId: string;
    /** 可为优先级列表；发送前需经 resolveMemberModels 解析为具体模型 id。 */
    modelId: string | string[];
    name: string;
}

/** modelId 已收窄为具体字符串的成员，用于持久化（会话 modelSelection.groupMembers）。 */
export interface PersistedGroupMember {
    providerId: string;
    modelId: string;
    name: string;
}

export interface GroupConfig {
    members: GroupMember[];
}

export interface MultiModelGroupProviderDeps {
    resolveMemberProvider(providerId: string): IModelProvider;
    /**
     * 取成员 provider 的（缓存）模型目录，用于把 modelId 优先级列表解析为具体可用模型。
     * 未提供时（如测试 mock），modelId 为数组时直接退化为取列表首项。
     */
    resolveMemberModels?(providerId: string): Promise<ProviderModelCatalog>;
    getGroupConfig(presetModelId?: string): GroupConfig;
    resolveSummarizer(presetModelId?: string): IModelProvider | null;
    getSummarizerConfig(presetModelId?: string): GroupSummarizerConfig | null;
}
