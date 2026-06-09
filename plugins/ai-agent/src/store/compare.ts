import { defineStore } from 'pinia';
import type { ProviderConfig } from '@packages/core/config';
import {
    type AnalysisResult,
    type ModelProviderRuntime
} from '@plugins/ai-agent/src/internal';
import { markRaw } from 'vue';
import { CompareWorkflowController, type CompareWorkflowStage } from '../runtime/workflows/compare/CompareWorkflowController';

export type CompareTab = 'native' | 'analysis';

type ProviderModelLoadState = {
    loading: boolean;
    loaded: boolean;
};

export interface CompareState {
    runtime: ModelProviderRuntime | null;
    controller: CompareWorkflowController | null;
    providerCatalog: ProviderConfig[];
    availableProviders: ProviderConfig[];
    providerModelStates: Record<string, ProviderModelLoadState>;
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

function cloneProviderConfig(provider: ProviderConfig): ProviderConfig {
    return {
        ...provider,
        models: provider.models.map((model) => ({ ...model }))
    };
}

function cloneProviders(providers: ProviderConfig[]): ProviderConfig[] {
    return providers.map(cloneProviderConfig);
}

function buildProviderModelStates(providers: ProviderConfig[]): Record<string, ProviderModelLoadState> {
    return Object.fromEntries(
        providers.map((provider) => [provider.id, { loading: false, loaded: false } satisfies ProviderModelLoadState])
    );
}

function resolveModelId(provider: ProviderConfig, modelId?: string): string {
    if (modelId && provider.models.some((item) => item.id === modelId)) {
        return modelId;
    }
    return provider.defaultModel;
}

function isConfiguredDefaultModelError(error: unknown): error is Error {
    return error instanceof Error && error.name === 'ConfiguredDefaultModelNotFoundError';
}

// DOM provider 受控页模型选择器尚未就绪（页面刚导航/未水合/未登录）。按 name 跨边界识别。
function isModelsNotReadyError(error: unknown): error is Error {
    return error instanceof Error && error.name === 'ModelsNotReadyError';
}

export const useCompareStore = defineStore('compare', {
    state: (): CompareState => ({
        runtime: null,
        controller: null,
        providerCatalog: [],
        availableProviders: [],
        providerModelStates: {},
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

    getters: {
        isModelALoading(state): boolean {
            if (!state.modelAProviderId) {
                return false;
            }

            const loadState = state.providerModelStates[state.modelAProviderId];
            return !loadState || loadState.loading || !loadState.loaded;
        },

        isModelBLoading(state): boolean {
            if (!state.modelBProviderId) {
                return false;
            }

            const loadState = state.providerModelStates[state.modelBProviderId];
            return !loadState || loadState.loading || !loadState.loaded;
        }
    },

    actions: {
        resolveProviderConfig(providerId: string): ProviderConfig | undefined {
            return this.availableProviders.find((item) => item.id === providerId);
        },

        setProviderCatalog(providers: ProviderConfig[]) {
            const nextCatalog = cloneProviders(providers);
            this.providerCatalog = nextCatalog;
            this.availableProviders = cloneProviders(nextCatalog);
            this.providerModelStates = buildProviderModelStates(nextCatalog);

            if (nextCatalog.length === 0) {
                this.modelAProviderId = '';
                this.modelAModelId = '';
                this.modelBProviderId = '';
                this.modelBModelId = '';
                return;
            }

            const defaultA = nextCatalog[0];
            const defaultB = nextCatalog[1] || nextCatalog[0];

            this.modelAProviderId = nextCatalog.some((item) => item.id === this.modelAProviderId)
                ? this.modelAProviderId
                : defaultA.id;
            this.modelBProviderId = nextCatalog.some((item) => item.id === this.modelBProviderId)
                ? this.modelBProviderId
                : defaultB.id;
            this.modelAModelId = '';
            this.modelBModelId = '';
        },

        setAvailableProviders(providers: ProviderConfig[]) {
            this.setProviderCatalog(providers);
        },

        setProviderModelState(providerId: string, nextState: Partial<ProviderModelLoadState>) {
            const current = this.providerModelStates[providerId] || { loading: false, loaded: false };
            this.providerModelStates = {
                ...this.providerModelStates,
                [providerId]: {
                    ...current,
                    ...nextState
                }
            };
        },

        applyProviderModelCatalog(providerId: string, models: ProviderConfig['models'], defaultModel: string) {
            this.availableProviders = this.availableProviders.map((provider) => {
                if (provider.id !== providerId) {
                    return provider;
                }

                return {
                    ...provider,
                    models: models.map((model) => ({ ...model })),
                    defaultModel
                };
            });

            if (this.modelAProviderId === providerId) {
                const provider = this.resolveProviderConfig(providerId);
                if (provider) {
                    this.modelAModelId = resolveModelId(provider, this.modelAModelId);
                }
            }

            if (this.modelBProviderId === providerId) {
                const provider = this.resolveProviderConfig(providerId);
                if (provider) {
                    this.modelBModelId = resolveModelId(provider, this.modelBModelId);
                }
            }
        },

        async ensureProviderModelsLoaded(providerId: string): Promise<ProviderConfig | null> {
            const loadState = this.providerModelStates[providerId];
            if (loadState?.loaded && !loadState.loading) {
                return this.resolveProviderConfig(providerId) || null;
            }

            const baseProvider = this.providerCatalog.find((item) => item.id === providerId);
            if (!baseProvider) {
                return null;
            }

            this.setProviderModelState(providerId, { loading: true });

            try {
                const catalog = this.runtime
                    ? await this.runtime.getProviderModels(providerId)
                    : {
                        models: baseProvider.models.map((model) => ({ ...model })),
                        defaultModel: baseProvider.defaultModel
                    };

                this.applyProviderModelCatalog(providerId, catalog.models, catalog.defaultModel);
                this.setProviderModelState(providerId, { loading: false, loaded: true });
            } catch (error) {
                if (isConfiguredDefaultModelError(error)) {
                    this.analysisError = error.message;
                    this.setProviderModelState(providerId, { loading: false, loaded: false });
                    throw error;
                }

                this.applyProviderModelCatalog(
                    providerId,
                    baseProvider.models.map((model) => ({ ...model })),
                    baseProvider.defaultModel
                );
                // 模型选择器未就绪：用静态兜底但不标记 loaded，下次重开 provider 时重读真实模型。
                const ready = !isModelsNotReadyError(error);
                this.setProviderModelState(providerId, { loading: false, loaded: ready });
            }

            return this.resolveProviderConfig(providerId) || null;
        },

        async setRuntime(runtime: ModelProviderRuntime) {
            this.runtime = markRaw(runtime);
            this.controller = markRaw(new CompareWorkflowController(runtime));
            this.setProviderCatalog(runtime.getProviderCatalog());

            if (!this.availableProviders.length) {
                return;
            }

            const defaultA = this.availableProviders[0];
            const defaultB = this.availableProviders[1] || defaultA;

            await this.setModelA(this.modelAProviderId || defaultA.id);
            await this.setModelB(this.modelBProviderId || defaultB.id);
        },

        async setModelA(providerId: string, modelId?: string) {
            const baseProvider = this.providerCatalog.find((item) => item.id === providerId);
            if (!baseProvider) {
                return;
            }

            this.modelAProviderId = providerId;
            this.modelAModelId = '';
            this.analysisError = null;
            const provider = await this.ensureProviderModelsLoaded(providerId);
            if (!provider) {
                return;
            }

            this.modelAModelId = resolveModelId(provider, modelId);
        },

        setModelAId(modelId: string) {
            const provider = this.resolveProviderConfig(this.modelAProviderId);
            if (!provider || !provider.models.some((item) => item.id === modelId)) {
                return;
            }

            this.modelAModelId = modelId;
        },

        async setModelB(providerId: string, modelId?: string) {
            const baseProvider = this.providerCatalog.find((item) => item.id === providerId);
            if (!baseProvider) {
                return;
            }

            this.modelBProviderId = providerId;
            this.modelBModelId = '';
            this.analysisError = null;
            const provider = await this.ensureProviderModelsLoaded(providerId);
            if (!provider) {
                return;
            }

            this.modelBModelId = resolveModelId(provider, modelId);
        },

        setModelBId(modelId: string) {
            const provider = this.resolveProviderConfig(this.modelBProviderId);
            if (!provider || !provider.models.some((item) => item.id === modelId)) {
                return;
            }

            this.modelBModelId = modelId;
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
            if (!this.modelAProviderId || !this.modelBProviderId || !this.modelAModelId || !this.modelBModelId) {
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
