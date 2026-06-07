import type {
    DocumentImportContribution,
    GlobalViewContribution,
    InsertLinkTypeContribution,
    LanguageModelContribution,
    NodePresentationContribution,
    RightPanelTabContribution,
    WorkspaceSelectionViewContribution
} from './contributions';

export interface ContributionQuery {
    getGlobalViews(): readonly GlobalViewContribution[];
    getRightPanelTabs(): readonly RightPanelTabContribution[];
    getWorkspaceSelectionViews(): readonly WorkspaceSelectionViewContribution[];
    getInsertLinkTypes(): readonly InsertLinkTypeContribution[];
    getDocumentImports(): readonly DocumentImportContribution[];
    getLanguageModels(): readonly LanguageModelContribution[];
    getNodePresentations(): readonly NodePresentationContribution[];
}
