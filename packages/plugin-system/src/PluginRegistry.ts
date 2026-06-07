import type {
    ContributionQuery,
    DocumentImportContribution,
    GlobalViewContribution,
    InsertLinkTypeContribution,
    LanguageModelContribution,
    NodePresentationContribution,
    RightPanelTabContribution,
    WorkspaceSelectionViewContribution
} from '@packages/core';
import { DuplicateContributionError } from './errors';

type OwnedContribution<TContribution extends { id: string; order?: number }> = {
    pluginId: string;
    sequence: number;
    contribution: TContribution;
};

function sortContributions<TContribution extends { id: string; order?: number }>(
    entries: OwnedContribution<TContribution>[]
): TContribution[] {
    return [...entries]
        .sort((left, right) => {
            const leftOrder = left.contribution.order ?? Number.MAX_SAFE_INTEGER;
            const rightOrder = right.contribution.order ?? Number.MAX_SAFE_INTEGER;
            if (leftOrder !== rightOrder) {
                return leftOrder - rightOrder;
            }

            return left.sequence - right.sequence;
        })
        .map((entry) => entry.contribution);
}

export class PluginRegistry implements ContributionQuery {
    private sequence = 0;

    private readonly globalViews: OwnedContribution<GlobalViewContribution>[] = [];

    private readonly rightPanelTabs: OwnedContribution<RightPanelTabContribution>[] = [];

    private readonly workspaceSelectionViews: OwnedContribution<WorkspaceSelectionViewContribution>[] = [];

    private readonly insertLinkTypes: OwnedContribution<InsertLinkTypeContribution>[] = [];

    private readonly documentImports: OwnedContribution<DocumentImportContribution>[] = [];

    private readonly languageModels: OwnedContribution<LanguageModelContribution>[] = [];

    private readonly nodePresentations: OwnedContribution<NodePresentationContribution>[] = [];

    public registerGlobalView(pluginId: string, view: GlobalViewContribution): void {
        this.registerContribution('global-view', this.globalViews, pluginId, view);
    }

    public registerRightPanelTab(pluginId: string, tab: RightPanelTabContribution): void {
        this.registerContribution('right-panel-tab', this.rightPanelTabs, pluginId, tab);
    }

    public registerWorkspaceSelectionView(pluginId: string, view: WorkspaceSelectionViewContribution): void {
        this.registerContribution('workspace-selection-view', this.workspaceSelectionViews, pluginId, view);
    }

    public registerInsertLinkType(pluginId: string, type: InsertLinkTypeContribution): void {
        this.registerContribution('insert-link-type', this.insertLinkTypes, pluginId, type);
    }

    public registerDocumentImport(pluginId: string, contribution: DocumentImportContribution): void {
        this.registerContribution('document-import', this.documentImports, pluginId, contribution);
    }

    public registerLanguageModel(pluginId: string, contribution: LanguageModelContribution): void {
        this.registerContribution('language-model', this.languageModels, pluginId, contribution);
    }

    public registerNodePresentation(pluginId: string, contribution: NodePresentationContribution): void {
        this.registerContribution('node-presentation', this.nodePresentations, pluginId, contribution);
    }

    public getGlobalViews(): readonly GlobalViewContribution[] {
        return sortContributions(this.globalViews);
    }

    public getRightPanelTabs(): readonly RightPanelTabContribution[] {
        return sortContributions(this.rightPanelTabs);
    }

    public getWorkspaceSelectionViews(): readonly WorkspaceSelectionViewContribution[] {
        return sortContributions(this.workspaceSelectionViews);
    }

    public getInsertLinkTypes(): readonly InsertLinkTypeContribution[] {
        return sortContributions(this.insertLinkTypes);
    }

    public getDocumentImports(): readonly DocumentImportContribution[] {
        return sortContributions(this.documentImports);
    }

    public getLanguageModels(): readonly LanguageModelContribution[] {
        return sortContributions(this.languageModels);
    }

    public getNodePresentations(): readonly NodePresentationContribution[] {
        return sortContributions(this.nodePresentations);
    }

    public removeByPlugin(pluginId: string): void {
        this.removeOwnedContributions(this.globalViews, pluginId);
        this.removeOwnedContributions(this.rightPanelTabs, pluginId);
        this.removeOwnedContributions(this.workspaceSelectionViews, pluginId);
        this.removeOwnedContributions(this.insertLinkTypes, pluginId);
        this.removeOwnedContributions(this.documentImports, pluginId);
        this.removeOwnedContributions(this.languageModels, pluginId);
        this.removeOwnedContributions(this.nodePresentations, pluginId);
    }

    private registerContribution<TContribution extends { id: string; order?: number }>(
        extensionPoint: string,
        target: OwnedContribution<TContribution>[],
        pluginId: string,
        contribution: TContribution
    ): void {
        const duplicate = target.find((entry) => entry.contribution.id === contribution.id);
        if (duplicate) {
            throw new DuplicateContributionError(extensionPoint, contribution.id);
        }

        target.push({
            pluginId,
            sequence: this.sequence++,
            contribution
        });
    }

    private removeOwnedContributions<TContribution extends { id: string }>(
        target: OwnedContribution<TContribution>[],
        pluginId: string
    ): void {
        for (let index = target.length - 1; index >= 0; index -= 1) {
            if (target[index]?.pluginId === pluginId) {
                target.splice(index, 1);
            }
        }
    }
}
