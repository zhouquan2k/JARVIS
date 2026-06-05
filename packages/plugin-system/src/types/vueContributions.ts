import type {
    GlobalViewContribution,
    RightPanelTabContribution,
    WorkspaceSelectionViewContribution
} from '@packages/core';

type VueComponentLike =
    | (new (...args: any[]) => unknown)
    | ((...args: any[]) => unknown)
    | Record<string, unknown>;

export type VueGlobalViewContribution = GlobalViewContribution<VueComponentLike>;
export type VueRightPanelTabContribution = RightPanelTabContribution<VueComponentLike>;
export type VueWorkspaceSelectionViewContribution = WorkspaceSelectionViewContribution<VueComponentLike>;
