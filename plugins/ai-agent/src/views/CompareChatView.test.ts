// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import type { ProviderConfig } from '@packages/core/config';
import CompareChatView from './CompareChatView.vue';
import { useCompareStore } from '../store/compare';

const PROVIDERS: ProviderConfig[] = [
    {
        id: 'provider-a',
        name: 'Provider A',
        models: [{ id: 'model-a', name: 'Model A' }],
        defaultModel: 'model-a',
        supportedRuntimeModes: ['web']
    },
    {
        id: 'provider-b',
        name: 'Provider B',
        models: [{ id: 'model-b', name: 'Model B' }],
        defaultModel: 'model-b',
        supportedRuntimeModes: ['web']
    }
];

function mountView() {
    return mount(CompareChatView, {
        global: {
            stubs: {
                CompareModelSelectors: {
                    template: '<div data-testid="selectors-stub" />'
                },
                AnalysisGrid: {
                    template: '<div data-testid="analysis-stub" />'
                },
                MarkdownContent: {
                    props: ['source'],
                    template: '<div>{{ source }}</div>'
                }
            }
        }
    });
}

function primeStore() {
    const store = useCompareStore();
    store.availableProviders = PROVIDERS.map((provider) => ({
        ...provider,
        models: provider.models.map((model) => ({ ...model }))
    }));
    store.providerModelStates = {
        'provider-a': { loading: false, loaded: true },
        'provider-b': { loading: false, loaded: true }
    };
    store.modelAProviderId = 'provider-a';
    store.modelAModelId = 'model-a';
    store.modelBProviderId = 'provider-b';
    store.modelBModelId = 'model-b';
    return store;
}

describe('CompareChatView', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('does not submit on plain Enter', async () => {
        const store = primeStore();
        const executeCompare = vi.fn().mockResolvedValue(undefined);
        store.executeCompare = executeCompare;

        const wrapper = mountView();
        const textarea = wrapper.get('[data-testid="compare-input"]');

        await textarea.setValue('第一行');
        await textarea.trigger('keydown', { key: 'Enter' });

        expect(executeCompare).not.toHaveBeenCalled();
    });

    it('submits on Ctrl+Enter', async () => {
        const store = primeStore();
        const executeCompare = vi.fn().mockResolvedValue(undefined);
        store.executeCompare = executeCompare;

        const wrapper = mountView();
        const textarea = wrapper.get('[data-testid="compare-input"]');

        await textarea.setValue('对比这个问题');
        await textarea.trigger('keydown', { key: 'Enter', ctrlKey: true });

        expect(executeCompare).toHaveBeenCalledWith('对比这个问题');
    });
});
