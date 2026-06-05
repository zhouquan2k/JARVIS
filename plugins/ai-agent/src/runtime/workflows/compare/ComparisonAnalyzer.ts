import { APP_CONFIG } from '@packages/core/config';
import type { IModelProvider, ModelProviderRuntime, AnalysisResult } from '@plugins/ai-agent/src/internal';
import { ANALYSIS_RESULT_FIELDS } from './types';

const REQUIRED_PROMPT_TOKENS = ['{prompt}', '{outputA}', '{outputB}'] as const;

export class AnalysisParseError extends Error {
    public readonly code = 'ANALYSIS_PARSE_ERROR';
    public readonly rawText: string;

    constructor(rawText: string, message = 'Failed to parse analyzer output into AnalysisResult') {
        super(message);
        this.name = 'AnalysisParseError';
        this.rawText = rawText;
    }
}

export class ComparisonAnalyzer {
    constructor(
        private readonly runtime: ModelProviderRuntime,
        private readonly analyzerConfig = APP_CONFIG.analyzer
    ) {
        const missingTokens = REQUIRED_PROMPT_TOKENS.filter((token) => !this.analyzerConfig.systemPrompt.includes(token));
        if (missingTokens.length > 0) {
            throw new Error(
                `APP_CONFIG.analyzer.systemPrompt is missing required placeholders: ${missingTokens.join(', ')}`
            );
        }
    }

    async analyze(
        prompt: string,
        outputA: string,
        outputB: string,
        onUpdate: (chunk: string) => void
    ): Promise<AnalysisResult> {
        const provider = this.runtime.getProvider(this.analyzerConfig.defaultProvider, { fresh: true });
        const analyzeComparison = (provider as Partial<AnalyzableProvider>).analyzeComparison;
        if (typeof analyzeComparison === 'function') {
            return analyzeComparison.call(
                provider,
                {
                    prompt,
                    outputA,
                    outputB,
                    analyzerProviderId: this.analyzerConfig.defaultProvider,
                    analyzerModelId: this.analyzerConfig.defaultModel
                },
                onUpdate
            );
        }

        const analysisPrompt = this.buildPrompt(prompt, outputA, outputB);
        let streamText = '';
        const result = await provider.sendMessage(
            analysisPrompt,
            { modelId: this.analyzerConfig.defaultModel },
            (update) => {
                streamText = update.text;
                onUpdate(update.text);
            }
        );

        const finalText = result.text || streamText;
        return this.parseResult(finalText);
    }

    private buildPrompt(prompt: string, outputA: string, outputB: string): string {
        return this.analyzerConfig.systemPrompt
            .split('{prompt}')
            .join(prompt)
            .split('{outputA}')
            .join(outputA)
            .split('{outputB}')
            .join(outputB);
    }

    private parseResult(rawText: string): AnalysisResult {
        const fencedJson = this.extractFirstMarkdownJsonBlock(rawText);
        if (fencedJson) {
            const parsedFromFence = this.tryParseAnalysisResult(fencedJson);
            if (parsedFromFence) {
                return parsedFromFence;
            }
        }

        const direct = this.tryParseAnalysisResult(rawText);
        if (direct) {
            return direct;
        }

        const firstJsonObject = this.extractFirstJSONObject(rawText);
        if (firstJsonObject) {
            const fallback = this.tryParseAnalysisResult(firstJsonObject);
            if (fallback) {
                return fallback;
            }
        }

        throw new AnalysisParseError(rawText);
    }

    private tryParseAnalysisResult(rawText: string): AnalysisResult | null {
        try {
            const parsed = JSON.parse(rawText) as Record<string, unknown>;
            const normalized = this.normalizeAnalysisResult(parsed);
            if (!normalized) {
                return null;
            }
            return normalized;
        } catch {
            return null;
        }
    }

    private normalizeAnalysisResult(data: Record<string, unknown>): AnalysisResult | null {
        const normalized: Partial<AnalysisResult> = {};

        for (const key of ANALYSIS_RESULT_FIELDS) {
            const value = data[key];
            const normalizedValue = this.normalizeField(value);
            if (normalizedValue === null) {
                return null;
            }
            normalized[key] = normalizedValue;
        }

        return normalized as AnalysisResult;
    }

    private normalizeField(value: unknown): string | null {
        if (typeof value === 'string') {
            return value;
        }

        if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
            return value.join('\n');
        }

        return null;
    }

    private extractFirstJSONObject(rawText: string): string | null {
        const start = rawText.indexOf('{');
        if (start === -1) {
            return null;
        }

        let depth = 0;
        let inString = false;
        let escaped = false;

        for (let i = start; i < rawText.length; i += 1) {
            const char = rawText[i];

            if (escaped) {
                escaped = false;
                continue;
            }

            if (char === '\\') {
                escaped = true;
                continue;
            }

            if (char === '"') {
                inString = !inString;
                continue;
            }

            if (inString) {
                continue;
            }

            if (char === '{') {
                depth += 1;
            } else if (char === '}') {
                depth -= 1;
                if (depth === 0) {
                    return rawText.slice(start, i + 1);
                }
            }
        }

        return null;
    }

    private extractFirstMarkdownJsonBlock(rawText: string): string | null {
        const fencedBlockRegex = /```(?:json)?\s*([\s\S]*?)```/i;
        const matched = rawText.match(fencedBlockRegex);
        if (!matched || typeof matched[1] !== 'string') {
            return null;
        }

        return matched[1].trim();
    }
}

export type AnalyzerProvider = IModelProvider;

interface AnalyzableProvider extends IModelProvider {
    analyzeComparison: (
        payload: {
            prompt: string;
            outputA: string;
            outputB: string;
            analyzerProviderId?: string;
            analyzerModelId?: string;
        },
        onUpdate: (chunk: string) => void
    ) => Promise<AnalysisResult>;
}
