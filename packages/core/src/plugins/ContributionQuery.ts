import type {
    DocumentCreationFlowContribution,
    GlobalViewContribution,
    InsertLinkTypeContribution,
    NodePresentationContribution,
    RightPanelTabContribution,
    WorkspaceSelectionViewContribution
} from './contributions';

export interface ContributionQuery {
    getGlobalViews(): readonly GlobalViewContribution[];
    getRightPanelTabs(): readonly RightPanelTabContribution[];
    getWorkspaceSelectionViews(): readonly WorkspaceSelectionViewContribution[];
    getInsertLinkTypes(): readonly InsertLinkTypeContribution[];
    getDocumentCreationFlows(): readonly DocumentCreationFlowContribution[];
    getNodePresentations(): readonly NodePresentationContribution[];
}
