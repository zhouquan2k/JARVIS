import { describe, expectTypeOf, it } from 'vitest';
import type {
    ContributionQuery,
    DocumentImportContribution,
    GlobalViewContribution,
    InsertLinkTypeContribution,
    LanguageModelContribution,
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
        expectTypeOf<PluginSetupApi['registerDocumentImport']>().parameters.toEqualTypeOf<[DocumentImportContribution]>();
        expectTypeOf<PluginSetupApi['registerLanguageModel']>().parameters.toEqualTypeOf<[LanguageModelContribution]>();
        expectTypeOf<PluginSetupApi['registerNodePresentation']>().parameters.toEqualTypeOf<[NodePresentationContribution]>();
        expectTypeOf<PluginSetupApi['getContributionQuery']>().returns.toEqualTypeOf<ContributionQuery>();
        expectTypeOf<PluginSetupApi['getHostContext']>().returns.toBeObject();

        expectTypeOf<ContributionQuery['getGlobalViews']>().returns.toEqualTypeOf<readonly GlobalViewContribution[]>();
        expectTypeOf<ContributionQuery['getRightPanelTabs']>().returns.toEqualTypeOf<readonly RightPanelTabContribution[]>();
        expectTypeOf<ContributionQuery['getWorkspaceSelectionViews']>().returns.toEqualTypeOf<readonly WorkspaceSelectionViewContribution[]>();
        expectTypeOf<ContributionQuery['getInsertLinkTypes']>().returns.toEqualTypeOf<readonly InsertLinkTypeContribution[]>();
        expectTypeOf<ContributionQuery['getDocumentImports']>().returns.toEqualTypeOf<readonly DocumentImportContribution[]>();
        expectTypeOf<ContributionQuery['getLanguageModels']>().returns.toEqualTypeOf<readonly LanguageModelContribution[]>();
        expectTypeOf<ContributionQuery['getNodePresentations']>().returns.toEqualTypeOf<readonly NodePresentationContribution[]>();

        expectTypeOf<PluginManifest['setup']>().parameters.toEqualTypeOf<[PluginSetupApi]>();
    });
});
