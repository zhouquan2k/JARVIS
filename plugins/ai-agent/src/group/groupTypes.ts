import type { GroupSummarizerConfig } from '@packages/core/config';
import type { IModelProvider } from '../interfaces/IModelProvider';

export interface GroupMember {
    providerId: string;
    modelId: string;
    name: string;
}

export interface GroupConfig {
    members: GroupMember[];
}

export interface MultiModelGroupProviderDeps {
    resolveMemberProvider(providerId: string): IModelProvider;
    getGroupConfig(presetModelId?: string): GroupConfig;
    resolveSummarizer(presetModelId?: string): IModelProvider | null;
    getSummarizerConfig(presetModelId?: string): GroupSummarizerConfig | null;
}
