import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { IModelProvider, ProviderRuntime } from '@packages/core/src';
import type { ProviderConfig } from '@packages/core/config';
import { useCompareStore } from './compare';

class MockCompareProvider implements IModelProvider {
    constructor(public id: string) {}

    async getAvailableModels() {
        return {
            models: [{ id: `${this.id}-model`, name: `${this.id} Model` }],
            defaultModel: `${this.id}-model`
        };
    }

    async checkAuth(): Promise<boolean> {
        return true;
    }

    async sendMessage(
        prompt: string,
        _options: { modelId?: string } = {},
        onUpdate: (update: { text: string }) => void
    ): Promise<{ text: string; conversationId: string; messageId: string }> {
        onUpdate({ text: `${this.id}:${prompt}` });
        return {
            text: `${this.id}:${prompt}`,
            conversationId: `${this.id}-conversation`,
            messageId: `${this.id}-message`
        };
    }

    abort(): void {}
}

const providerCatalog: ProviderConfig[] = [
    {
        id: 'provider-a',
        name: 'Provider A',
        models: [{ id: 'provider-a-static', name: 'Provider A Static' }],
        defaultModel: 'provider-a-static',
        supportedRuntimeModes: ['web']
    },
    {
        id: 'provider-b',
        name: 'Provider B',
        models: [{ id: 'provider-b-static', name: 'Provider B Static' }],
        defaultModel: 'provider-b-static',
        supportedRuntimeModes: ['web']
    }
];

function createRuntime(): ProviderRuntime {
    return {
        getAvailableProviders: () => providerCatalog,
        getProviderCatalog: () => providerCatalog,
        getProviderModels: async (providerId: string) => ({
            models: [{ id: `${providerId}-dynamic`, name: `${providerId} Dynamic` }],
            defaultModel: `${providerId}-dynamic`
        }),
        getProvider: (providerId: string) => new MockCompareProvider(providerId)
    };
}

describe('useCompareStore provider model catalogs', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('loads model catalogs for default compare providers', async () => {
        const store = useCompareStore();
        await store.setRuntime(createRuntime());

        expect(store.modelAProviderId).toBe('provider-a');
        expect(store.modelAModelId).toBe('provider-a-dynamic');
        expect(store.modelBProviderId).toBe('provider-b');
        expect(store.modelBModelId).toBe('provider-b-dynamic');
        expect(store.isModelALoading).toBe(false);
        expect(store.isModelBLoading).toBe(false);
    });

    it('updates A and B model selections independently when provider changes', async () => {
        const store = useCompareStore();
        await store.setRuntime(createRuntime());

        await store.setModelA('provider-b');
        expect(store.modelAProviderId).toBe('provider-b');
        expect(store.modelAModelId).toBe('provider-b-dynamic');
        expect(store.modelBProviderId).toBe('provider-b');
        expect(store.modelBModelId).toBe('provider-b-dynamic');

        await store.setModelB('provider-a');
        expect(store.modelAProviderId).toBe('provider-b');
        expect(store.modelAModelId).toBe('provider-b-dynamic');
        expect(store.modelBProviderId).toBe('provider-a');
        expect(store.modelBModelId).toBe('provider-a-dynamic');
    });
});
