import { describe, expect, it } from 'vitest';
import type { IModelProvider } from '../interfaces/IModelProvider';
import type { ProviderRuntime } from '../runtime/types';
import { CompareWorkflowController } from './CompareWorkflowController';

class AsyncMockProvider implements IModelProvider {
    public readonly id: string;
    public doneAt = 0;

    constructor(
        id: string,
        private readonly text: string,
        private readonly delayMs: number,
        private readonly shouldFail = false
    ) {
        this.id = id;
    }

    async checkAuth(): Promise<boolean> {
        return true;
    }

    async getAvailableModels() {
        return {
            models: [{ id: `${this.id}-model`, name: `${this.id} Model` }],
            defaultModel: `${this.id}-model`
        };
    }

    async sendMessage(
        _prompt: string,
        _options: { modelId?: string } = {},
        onUpdate: (update: { text: string }) => void
    ): Promise<{ text: string; conversationId: string; messageId: string }> {
        onUpdate({ text: `${this.id}:streaming` });
        await new Promise((resolve) => setTimeout(resolve, this.delayMs));
        if (this.shouldFail) {
            throw new Error(`${this.id} failed`);
        }
        onUpdate({ text: this.text });
        this.doneAt = Date.now();
        return {
            text: this.text,
            conversationId: `${this.id}-conversation`,
            messageId: `${this.id}-message`
        };
    }

    abort(): void {}
}

describe('CompareWorkflowController', () => {
    it('runs model A and B concurrently then triggers analyzer', async () => {
        const providerA = new AsyncMockProvider('provider-a', 'final A', 40);
        const providerB = new AsyncMockProvider('provider-b', 'final B', 10);
        const runtimeCalls: Array<{ providerId: string; fresh?: boolean }> = [];

        const runtime: ProviderRuntime = {
            getAvailableProviders: () => [],
            getProviderCatalog: () => [],
            getProviderModels: async (providerId) => ({
                models: [{ id: `${providerId}-model`, name: `${providerId} Model` }],
                defaultModel: `${providerId}-model`
            }),
            getProvider: (providerId, options) => {
                runtimeCalls.push({ providerId, fresh: options?.fresh });
                return providerId === 'a' ? providerA : providerB;
            }
        };

        let analyzeCalledAt = 0;
        const analyzer = {
            analyze: async (_prompt: string, outputA: string, outputB: string, onUpdate: (chunk: string) => void) => {
                analyzeCalledAt = Date.now();
                onUpdate('analysis-stream');
                return {
                    agreements: `${outputA}+${outputB}`,
                    conflictsA: 'ca',
                    conflictsB: 'cb',
                    uniqueA: 'ua',
                    uniqueB: 'ub'
                };
            }
        };

        const controller = new CompareWorkflowController(runtime, analyzer);
        const stages: string[] = [];
        const outputAUpdates: string[] = [];
        const outputBUpdates: string[] = [];
        const analysisUpdates: string[] = [];

        const result = await controller.executeCompareWorkflow({
            prompt: 'compare this',
            modelA: { providerId: 'a', modelId: 'model-a' },
            modelB: { providerId: 'b', modelId: 'model-b' },
            onOutputA: (chunk) => outputAUpdates.push(chunk),
            onOutputB: (chunk) => outputBUpdates.push(chunk),
            onAnalysisUpdate: (chunk) => analysisUpdates.push(chunk),
            onStageChange: (stage) => stages.push(stage)
        });

        expect(runtimeCalls).toEqual([
            { providerId: 'a', fresh: true },
            { providerId: 'b', fresh: true }
        ]);
        expect(outputAUpdates.at(-1)).toBe('final A');
        expect(outputBUpdates.at(-1)).toBe('final B');
        expect(analysisUpdates).toEqual(['analysis-stream']);
        expect(result.outputA).toBe('final A');
        expect(result.outputB).toBe('final B');
        expect(result.analysis.agreements).toBe('final A+final B');
        expect(stages).toEqual(['generating', 'analyzing', 'completed']);
        expect(analyzeCalledAt).toBeGreaterThanOrEqual(Math.max(providerA.doneAt, providerB.doneAt));
    });

    it('emits failed stage when workflow throws', async () => {
        const providerA = new AsyncMockProvider('provider-a', 'final A', 10);
        const providerB = new AsyncMockProvider('provider-b', 'final B', 10, true);
        const runtime: ProviderRuntime = {
            getAvailableProviders: () => [],
            getProviderCatalog: () => [],
            getProviderModels: async (providerId) => ({
                models: [{ id: `${providerId}-model`, name: `${providerId} Model` }],
                defaultModel: `${providerId}-model`
            }),
            getProvider: (providerId) => (providerId === 'a' ? providerA : providerB)
        };

        const controller = new CompareWorkflowController(runtime, {
            analyze: async () => ({
                agreements: '',
                conflictsA: '',
                conflictsB: '',
                uniqueA: '',
                uniqueB: ''
            })
        });

        const stages: string[] = [];
        await expect(
            controller.executeCompareWorkflow({
                prompt: 'compare this',
                modelA: { providerId: 'a', modelId: 'model-a' },
                modelB: { providerId: 'b', modelId: 'model-b' },
                onOutputA: () => undefined,
                onOutputB: () => undefined,
                onAnalysisUpdate: () => undefined,
                onStageChange: (stage) => stages.push(stage)
            })
        ).rejects.toThrow('provider-b failed');

        expect(stages).toEqual(['generating', 'failed']);
    });
});
