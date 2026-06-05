import { describe, expect, it } from 'vitest';
import type { IModelProvider, ModelProviderRuntime } from '@plugins/ai-agent/src/internal';
import { AnalysisParseError, ComparisonAnalyzer } from './ComparisonAnalyzer';

class MockModelProvider implements IModelProvider {
    public id = 'mock-provider';
    public readonly prompts: string[] = [];
    public readonly optionsUsed: Array<{ modelId?: string }> = [];

    constructor(
        private readonly responseText: string,
        private readonly streamChunks: string[] = []
    ) {}

    async checkAuth(): Promise<boolean> {
        return true;
    }

    async getAvailableModels() {
        return {
            models: [{ id: 'mock-model', name: 'Mock Model' }],
            defaultModel: 'mock-model'
        };
    }

    async sendMessage(
        prompt: string,
        options: { modelId?: string } = {},
        onUpdate: (update: { text: string }) => void
    ): Promise<{ text: string; conversationId: string; messageId: string }> {
        this.prompts.push(prompt);
        this.optionsUsed.push(options);

        for (const chunk of this.streamChunks) {
            onUpdate({ text: chunk });
        }

        return {
            text: this.responseText,
            conversationId: 'mock-conversation',
            messageId: 'mock-message'
        };
    }

    abort(): void {}
}

describe('ComparisonAnalyzer', () => {
    it('uses analyzer config and emits streaming updates', async () => {
        const provider = new MockModelProvider(
            JSON.stringify({
                agreements: 'same',
                conflictsA: 'a differs',
                conflictsB: 'b differs',
                uniqueA: 'only a',
                uniqueB: 'only b'
            }),
            ['partial-1', 'partial-2']
        );

        const runtimeCalls: Array<{ providerId: string; fresh?: boolean }> = [];
        const runtime: ModelProviderRuntime = {
            getAvailableProviders: () => [],
            getProviderCatalog: () => [],
            getProviderModels: async () => ({ models: [{ id: 'mock-model', name: 'Mock Model' }], defaultModel: 'mock-model' }),
            getProvider: (providerId, options) => {
                runtimeCalls.push({ providerId, fresh: options?.fresh });
                return provider;
            }
        };

        const analyzer = new ComparisonAnalyzer(runtime, {
            defaultProvider: 'mock-provider',
            defaultModel: 'mock-model',
            systemPrompt: 'PROMPT:{prompt}\nA:{outputA}\nB:{outputB}'
        });

        const updates: string[] = [];
        const result = await analyzer.analyze('Q', 'A1', 'B1', (chunk) => updates.push(chunk));

        expect(result.agreements).toBe('same');
        expect(runtimeCalls).toEqual([{ providerId: 'mock-provider', fresh: true }]);
        expect(provider.optionsUsed[0]?.modelId).toBe('mock-model');
        expect(provider.prompts[0]).toContain('PROMPT:Q');
        expect(provider.prompts[0]).toContain('A:A1');
        expect(provider.prompts[0]).toContain('B:B1');
        expect(updates).toEqual(['partial-1', 'partial-2']);
    });

    it('parses first json object from wrapped text', async () => {
        const provider = new MockModelProvider(
            'analysis:\n{"agreements":"x","conflictsA":"a","conflictsB":"b","uniqueA":"ua","uniqueB":"ub"}\nend'
        );
        const runtime: ModelProviderRuntime = {
            getAvailableProviders: () => [],
            getProviderCatalog: () => [],
            getProviderModels: async () => ({ models: [{ id: 'mock', name: 'Mock' }], defaultModel: 'mock' }),
            getProvider: () => provider
        };
        const analyzer = new ComparisonAnalyzer(runtime, {
            defaultProvider: 'mock',
            defaultModel: 'mock',
            systemPrompt: '{prompt}::{outputA}::{outputB}'
        });

        const result = await analyzer.analyze('q', 'a', 'b', () => undefined);
        expect(result.uniqueA).toBe('ua');
        expect(result.uniqueB).toBe('ub');
    });

    it('throws AnalysisParseError when response cannot be parsed', async () => {
        const provider = new MockModelProvider('not-json');
        const runtime: ModelProviderRuntime = {
            getAvailableProviders: () => [],
            getProviderCatalog: () => [],
            getProviderModels: async () => ({ models: [{ id: 'mock', name: 'Mock' }], defaultModel: 'mock' }),
            getProvider: () => provider
        };
        const analyzer = new ComparisonAnalyzer(runtime, {
            defaultProvider: 'mock',
            defaultModel: 'mock',
            systemPrompt: '{prompt}::{outputA}::{outputB}'
        });

        await expect(analyzer.analyze('q', 'a', 'b', () => undefined)).rejects.toBeInstanceOf(AnalysisParseError);
    });

    it('supports markdown fenced json with array fields', async () => {
        const provider = new MockModelProvider(`\`\`\`json
{
  "agreements": ["a1", "a2"],
  "conflictsA": ["ca1"],
  "conflictsB": ["cb1", "cb2"],
  "uniqueA": ["ua1"],
  "uniqueB": ["ub1"]
}
\`\`\``);
        const runtime: ModelProviderRuntime = {
            getAvailableProviders: () => [],
            getProviderCatalog: () => [],
            getProviderModels: async () => ({ models: [{ id: 'mock', name: 'Mock' }], defaultModel: 'mock' }),
            getProvider: () => provider
        };
        const analyzer = new ComparisonAnalyzer(runtime, {
            defaultProvider: 'mock',
            defaultModel: 'mock',
            systemPrompt: '{prompt}::{outputA}::{outputB}'
        });

        const result = await analyzer.analyze('q', 'a', 'b', () => undefined);
        expect(result.agreements).toBe('a1\na2');
        expect(result.conflictsB).toBe('cb1\ncb2');
    });
});
