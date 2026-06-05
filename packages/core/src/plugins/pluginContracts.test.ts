import { describe, expectTypeOf, it } from 'vitest';
import type {
    ContributionQuery,
    DocumentCreationFlowContribution,
    GlobalViewContribution,
    InsertLinkTypeContribution,
    NodePresentationContribution,
    PluginEnablementConfig,
    PluginManifest,
    PluginSetupApi,
    RightPanelTabContribution,
    WorkspaceSelectionViewContribution
} from '../index';

describe('plugin contracts', () => {
    it('stay runtime agnostic and expose the required signatures', () => {
        expectTypeOf<PluginEnablementConfig>().toMatchTypeOf<{
            enabledPluginIds: string[];
        }>();

        expectTypeOf<PluginSetupApi['registerGlobalView']>().parameters.toEqualTypeOf<[GlobalViewContribution]>();
        expectTypeOf<PluginSetupApi['registerRightPanelTab']>().parameters.toEqualTypeOf<[RightPanelTabContribution]>();
        expectTypeOf<PluginSetupApi['registerWorkspaceSelectionView']>().parameters.toEqualTypeOf<[WorkspaceSelectionViewContribution]>();
        expectTypeOf<PluginSetupApi['registerInsertLinkType']>().parameters.toEqualTypeOf<[InsertLinkTypeContribution]>();
        expectTypeOf<PluginSetupApi['registerDocumentCreationFlow']>().parameters.toEqualTypeOf<[DocumentCreationFlowContribution]>();
        expectTypeOf<PluginSetupApi['registerNodePresentation']>().parameters.toEqualTypeOf<[NodePresentationContribution]>();
        expectTypeOf<PluginSetupApi['getHostContext']>().returns.toBeObject();

        expectTypeOf<ContributionQuery['getGlobalViews']>().returns.toEqualTypeOf<readonly GlobalViewContribution[]>();
        expectTypeOf<ContributionQuery['getRightPanelTabs']>().returns.toEqualTypeOf<readonly RightPanelTabContribution[]>();
        expectTypeOf<ContributionQuery['getWorkspaceSelectionViews']>().returns.toEqualTypeOf<readonly WorkspaceSelectionViewContribution[]>();
        expectTypeOf<ContributionQuery['getInsertLinkTypes']>().returns.toEqualTypeOf<readonly InsertLinkTypeContribution[]>();
        expectTypeOf<ContributionQuery['getDocumentCreationFlows']>().returns.toEqualTypeOf<readonly DocumentCreationFlowContribution[]>();
        expectTypeOf<ContributionQuery['getNodePresentations']>().returns.toEqualTypeOf<readonly NodePresentationContribution[]>();

        expectTypeOf<PluginManifest['setup']>().parameters.toEqualTypeOf<[PluginSetupApi]>();
    });
});
