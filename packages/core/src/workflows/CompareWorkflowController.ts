import { ComparisonAnalyzer } from '../analysis/ComparisonAnalyzer';
import type { AnalysisResult } from '../analysis/types';
import type { ProviderRuntime } from '../runtime/types';

export interface CompareModelSelection {
    providerId: string;
    modelId: string;
}

export type CompareWorkflowStage = 'generating' | 'analyzing' | 'completed' | 'failed';

export interface CompareWorkflowCallbacks {
    onOutputA: (chunk: string) => void;
    onOutputB: (chunk: string) => void;
    onAnalysisUpdate: (chunk: string) => void;
    onStageChange?: (stage: CompareWorkflowStage, error?: Error) => void;
}

export interface ExecuteCompareWorkflowParams extends CompareWorkflowCallbacks {
    prompt: string;
    modelA: CompareModelSelection;
    modelB: CompareModelSelection;
}

export interface CompareWorkflowResult {
    outputA: string;
    outputB: string;
    analysis: AnalysisResult;
}

export interface ComparisonAnalyzerLike {
    analyze(
        prompt: string,
        outputA: string,
        outputB: string,
        onUpdate: (chunk: string) => void
    ): Promise<AnalysisResult>;
}

export class CompareWorkflowController {
    private activeProviders: Array<{ abort: () => void }> = [];

    constructor(
        private readonly runtime: ProviderRuntime,
        private readonly analyzer: ComparisonAnalyzerLike = new ComparisonAnalyzer(runtime)
    ) {}

    async executeCompareWorkflow(params: ExecuteCompareWorkflowParams): Promise<CompareWorkflowResult> {
        const { prompt, modelA, modelB, onOutputA, onOutputB, onAnalysisUpdate, onStageChange } = params;
        onStageChange?.('generating');

        const providerA = this.runtime.getProvider(modelA.providerId, { fresh: true });
        const providerB = this.runtime.getProvider(modelB.providerId, { fresh: true });
        this.activeProviders = [providerA, providerB];

        let outputA = '';
        let outputB = '';

        try {
            const [resultA, resultB] = await Promise.all([
                providerA.sendMessage(prompt, { modelId: modelA.modelId }, (chunk: string) => {
                    outputA = chunk;
                    onOutputA(chunk);
                }),
                providerB.sendMessage(prompt, { modelId: modelB.modelId }, (chunk: string) => {
                    outputB = chunk;
                    onOutputB(chunk);
                })
            ]);

            outputA = resultA.text || outputA;
            outputB = resultB.text || outputB;

            onStageChange?.('analyzing');
            const analysis = await this.analyzer.analyze(prompt, outputA, outputB, onAnalysisUpdate);
            onStageChange?.('completed');
            return { outputA, outputB, analysis };
        } catch (error) {
            const normalized = error instanceof Error ? error : new Error(String(error));
            onStageChange?.('failed', normalized);
            throw normalized;
        } finally {
            this.activeProviders = [];
        }
    }

    abort() {
        this.activeProviders.forEach((provider) => provider.abort());
        this.activeProviders = [];
    }
}
