import type { IHostContext } from '../interfaces/IHostContext';
import type {
    DocumentCreationFlowContribution,
    GlobalViewContribution,
    InsertLinkTypeContribution,
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
    registerDocumentCreationFlow(flow: DocumentCreationFlowContribution): void;
    registerNodePresentation(contribution: NodePresentationContribution): void;
    getRuntimeContext(): WorkspaceRuntimeContext;
    getHostContext(): IHostContext;
}
