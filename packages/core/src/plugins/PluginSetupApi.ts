import type { IHostContext } from '../interfaces/IHostContext';
import type { ContributionQuery } from './ContributionQuery';
import type {
    DocumentImportContribution,
    GlobalViewContribution,
    InsertLinkTypeContribution,
    LanguageModelContribution,
    NodePresentationContribution,
    RightPanelTabContribution,
    WorkspaceSelectionViewContribution
} from './contributions';
import type { WorkspaceRuntimeContext } from './WorkspaceRuntimeContext';

export interface PluginSetupApi {
    registerGlobalView(view: GlobalViewContribution): void;
    registerRightPanelTab(tab: RightPanelTabContribution): void;
    registerWorkspaceSelectionView(view: WorkspaceSelectionViewContribution): void;
    registerInsertLinkType(type: InsertLinkTypeContribution): void;
    registerDocumentImport(contribution: DocumentImportContribution): void;
    registerLanguageModel(contribution: LanguageModelContribution): void;
    registerNodePresentation(contribution: NodePresentationContribution): void;
    getContributionQuery(): ContributionQuery;
    getRuntimeContext(): WorkspaceRuntimeContext;
    getHostContext(): IHostContext;
}
