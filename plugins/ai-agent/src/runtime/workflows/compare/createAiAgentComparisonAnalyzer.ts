import { APP_CONFIG, type ModelProviderRuntime } from '@plugins/ai-agent/src/internal';
import { ComparisonAnalyzer } from './ComparisonAnalyzer';

export interface CreateAiAgentComparisonAnalyzerOptions {
    providerId?: string;
    modelId?: string;
}

export function createAiAgentComparisonAnalyzer(
    runtime: ModelProviderRuntime,
    options: CreateAiAgentComparisonAnalyzerOptions = {}
): ComparisonAnalyzer {
    return new ComparisonAnalyzer(runtime, {
        ...APP_CONFIG.analyzer,
        defaultProvider: options.providerId || APP_CONFIG.analyzer.defaultProvider,
        defaultModel: options.modelId || APP_CONFIG.analyzer.defaultModel
    });
}
