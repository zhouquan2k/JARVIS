import type { InjectionKey, Ref } from 'vue';
import type { ContributionQuery, WorkspaceRuntimeContext } from '@packages/core';

export const contributionQueryKey: InjectionKey<Ref<ContributionQuery | null>> = Symbol('contributionQuery');
export const workspaceRuntimeContextKey: InjectionKey<Ref<WorkspaceRuntimeContext | null>> = Symbol('workspaceRuntimeContext');
