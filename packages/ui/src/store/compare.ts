import { defineStore } from 'pinia';
import type { ProviderConfig } from '@packages/core/config';
import type { AnalysisResult } from '@packages/core/src/analysis/types';
import { CompareWorkflowController, type CompareWorkflowStage } from '@packages/core/src/workflows/CompareWorkflowController';
import type { ProviderRuntime } from '@packages/core/src/runtime/types';
import { markRaw } from 'vue';

export type CompareTab = 'native' | 'analysis';

export interface CompareState {
    runtime: ProviderRuntime | null;
    controller: CompareWorkflowController | null;
    availableProviders: ProviderConfig[];
    modelAProviderId: string;
    modelAModelId: string;
    modelBProviderId: string;
    modelBModelId: string;
    prompt: string;
    outputA: string;
    outputB: string;
    analysisRaw: string;
    analysisResult: AnalysisResult | null;
    analysisError: string | null;
    activeTab: CompareTab;
    hasAnalysisStartedStreaming: boolean;
    stage: 'idle' | CompareWorkflowStage;
}

function resolveModelId(provider: ProviderConfig, modelId?: string): string {
    if (modelId && provider.models.some((item) => item.id === modelId)) {
        return modelId;
    }
    return provider.defaultModel;
}

export const useCompareStore = defineStore('compare', {
    state: (): CompareState => ({
        runtime: null,
        controller: null,
        availableProviders: [],
        modelAProviderId: '',
        modelAModelId: '',
        modelBProviderId: '',
        modelBModelId: '',
        prompt: '',
        outputA: '',
        outputB: '',
        analysisRaw: '',
        analysisResult: null,
        analysisError: null,
        activeTab: 'native',
        hasAnalysisStartedStreaming: false,
        stage: 'idle'
    }),

    actions: {
        setRuntime(runtime: ProviderRuntime) {
            this.runtime = markRaw(runtime);
            this.controller = markRaw(new CompareWorkflowController(runtime));
            this.setAvailableProviders(runtime.getAvailableProviders());
        },

        setAvailableProviders(providers: ProviderConfig[]) {
            this.availableProviders = providers;
            if (providers.length === 0) {
                this.modelAProviderId = '';
                this.modelAModelId = '';
                this.modelBProviderId = '';
                this.modelBModelId = '';
                return;
            }

            const defaultA = providers[0];
            const defaultB = providers[1] || providers[0];

            this.setModelA(this.modelAProviderId || defaultA.id, this.modelAModelId || defaultA.defaultModel);
            this.setModelB(this.modelBProviderId || defaultB.id, this.modelBModelId || defaultB.defaultModel);
        },

        setModelA(providerId: string, modelId?: string) {
            const provider = this.availableProviders.find((item) => item.id === providerId);
            if (!provider) {
                return;
            }

            this.modelAProviderId = provider.id;
            this.modelAModelId = resolveModelId(provider, modelId);
        },

        setModelB(providerId: string, modelId?: string) {
            const provider = this.availableProviders.find((item) => item.id === providerId);
            if (!provider) {
                return;
            }

            this.modelBProviderId = provider.id;
            this.modelBModelId = resolveModelId(provider, modelId);
        },

        setActiveTab(tab: CompareTab) {
            this.activeTab = tab;
        },

        resetCompareState() {
            this.prompt = '';
            this.outputA = '';
            this.outputB = '';
            this.analysisRaw = '';
            this.analysisResult = null;
            this.analysisError = null;
            this.activeTab = 'native';
            this.hasAnalysisStartedStreaming = false;
            this.stage = 'idle';
        },

        startNewCompare() {
            this.resetCompareState();
        },

        async executeCompare(prompt: string) {
            const trimmedPrompt = prompt.trim();
            if (!trimmedPrompt) {
                return;
            }
            if (!this.controller) {
                throw new Error('Compare workflow controller is not initialized');
            }
            if (!this.modelAProviderId || !this.modelBProviderId) {
                throw new Error('Provider/model selections are not initialized');
            }

            this.resetCompareState();
            this.prompt = trimmedPrompt;
            this.stage = 'generating';

            try {
                const result = await this.controller.executeCompareWorkflow({
                    prompt: trimmedPrompt,
                    modelA: {
                        providerId: this.modelAProviderId,
                        modelId: this.modelAModelId
                    },
                    modelB: {
                        providerId: this.modelBProviderId,
                        modelId: this.modelBModelId
                    },
                    onOutputA: (chunk: string) => {
                        this.outputA = chunk;
                    },
                    onOutputB: (chunk: string) => {
                        this.outputB = chunk;
                    },
                    onAnalysisUpdate: (chunk: string) => {
                        this.analysisRaw = chunk;
                        if (!this.hasAnalysisStartedStreaming) {
                            this.hasAnalysisStartedStreaming = true;
                            this.activeTab = 'analysis';
                        }
                    },
                    onStageChange: (stage: CompareWorkflowStage, error?: Error) => {
                        this.stage = stage;
                        if (stage === 'failed' && error) {
                            this.analysisError = error.message;
                        }
                    }
                });

                this.outputA = result.outputA;
                this.outputB = result.outputB;
                this.analysisResult = result.analysis;
                this.stage = 'completed';
            } catch (error) {
                this.stage = 'failed';
                this.analysisError = error instanceof Error ? error.message : String(error);
            }
        },

        abort() {
            this.controller?.abort();
            this.stage = 'failed';
            this.analysisError = 'Workflow aborted by user';
        }
    }
});
