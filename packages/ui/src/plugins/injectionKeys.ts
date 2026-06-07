import type { InjectionKey, Ref } from 'vue';
import type { ContributionQuery, WorkspaceRuntimeContext } from '@packages/core';
import type { ChatRoutePath } from '../routes';

export interface WorkspaceNavigationState {
    tab?: string | null;
    detailKey?: string | null;
}

export interface WorkspaceNavigationApi {
    openNode(path: string, options?: WorkspaceNavigationState): Promise<void>;
}

export const contributionQueryKey: InjectionKey<Ref<ContributionQuery | null>> = Symbol('contributionQuery');
export const workspaceRuntimeContextKey: InjectionKey<Ref<WorkspaceRuntimeContext | null>> = Symbol('workspaceRuntimeContext');
export const workspaceNavigationApiKey: InjectionKey<WorkspaceNavigationApi> = Symbol('workspaceNavigationApi');
export const workspaceNavigationStateKey: InjectionKey<Ref<WorkspaceNavigationState | null>> = Symbol('workspaceNavigationState');
export const workspaceRouteKey: InjectionKey<Ref<ChatRoutePath>> = Symbol('workspaceRoute');
