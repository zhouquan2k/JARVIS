import { describe, expect, it } from 'vitest';
import { createProviderRuntime } from './createProviderRuntime';
import type { IModelProvider, ProviderStreamUpdate, SendMessageOptions } from '../interfaces/IModelProvider';

class CustomGeminiProvider implements IModelProvider {
    public id = 'custom-gemini';
    public catalogCalls = 0;

    async getAvailableModels() {
        this.catalogCalls += 1;
        return {
            models: [
                { id: 'custom-fast', name: 'Custom Fast' },
                { id: 'custom-pro-latest', name: 'Gemini Pro Latest' }
            ],
            defaultModel: 'custom-fast'
        };
    }

    async checkAuth(): Promise<boolean> {
        return true;
    }

    async sendMessage(
        _prompt: string,
        _options: SendMessageOptions,
        onUpdate: (update: ProviderStreamUpdate) => void
    ): Promise<{ text: string; conversationId: string; messageId: string }> {
        onUpdate({ text: 'custom' });
        return {
            text: 'custom',
            conversationId: 'conversation-id',
            messageId: 'message-id'
        };
    }

    abort(): void {}
}

class InvalidCatalogProvider extends CustomGeminiProvider {
    override async getAvailableModels() {
        this.catalogCalls += 1;
        return {
            models: [],
            defaultModel: 'missing'
        };
    }
}

describe('createProviderRuntime', () => {
    it('filters providers by runtimeMode', () => {
        const runtime = createProviderRuntime({ runtimeMode: 'web' });
        const providers = runtime.getProviderCatalog();
        expect(providers.every((provider) => provider.supportedRuntimeModes.includes('web'))).toBe(true);
    });

    it('returns model provider instances with IModelProvider contract', () => {
        const runtime = createProviderRuntime({ runtimeMode: 'extension' });
        const provider = runtime.getProvider('gemini-api');
        expect(provider.id).toBe('gemini-api');
        expect(typeof provider.checkAuth).toBe('function');
        expect(typeof provider.sendMessage).toBe('function');
        expect(typeof provider.abort).toBe('function');
    });

    it('returns cached instance in default mode', () => {
        const runtime = createProviderRuntime({ runtimeMode: 'web' });
        const providerA = runtime.getProvider('gemini-api');
        const providerB = runtime.getProvider('gemini-api');
        expect(providerA).toBe(providerB);
    });

    it('returns fresh instance when fresh option is true', () => {
        const runtime = createProviderRuntime({ runtimeMode: 'web' });
        const cached = runtime.getProvider('gemini-api');
        const freshA = runtime.getProvider('gemini-api', { fresh: true });
        const freshB = runtime.getProvider('gemini-api', { fresh: true });

        expect(freshA).not.toBe(cached);
        expect(freshB).not.toBe(cached);
        expect(freshA).not.toBe(freshB);
        expect(runtime.getProvider('gemini-api')).toBe(cached);
    });

    it('uses injected credentials with higher priority', async () => {
        const runtime = createProviderRuntime({
            runtimeMode: 'web',
            credentials: {
                geminiApiKey: 'injected-key'
            }
        });

        const provider = runtime.getProvider('gemini-api');
        await expect(provider.checkAuth()).resolves.toBe(true);
    });

    it('uses custom providerFactory when provided', () => {
        const runtime = createProviderRuntime({
            runtimeMode: 'web',
            providerFactory(providerId) {
                if (providerId !== 'gemini-api') {
                    return undefined;
                }
                return new CustomGeminiProvider();
            }
        });

        const provider = runtime.getProvider('gemini-api');
        expect(provider.id).toBe('custom-gemini');
    });

    it('returns provider-driven model catalogs', async () => {
        const customProvider = new CustomGeminiProvider();
        const runtime = createProviderRuntime({
            runtimeMode: 'web',
            providerFactory(providerId) {
                if (providerId !== 'gemini-api') {
                    return undefined;
                }
                return customProvider;
            }
        });

        await expect(runtime.getProviderModels('gemini-api')).resolves.toEqual({
            models: [
                { id: 'custom-fast', name: 'Custom Fast' },
                { id: 'custom-pro-latest', name: 'Gemini Pro Latest' }
            ],
            defaultModel: 'custom-pro-latest'
        });
        expect(customProvider.catalogCalls).toBe(1);
    });

    it('caches resolved provider model catalogs', async () => {
        const customProvider = new CustomGeminiProvider();
        const runtime = createProviderRuntime({
            runtimeMode: 'web',
            providerFactory(providerId) {
                if (providerId !== 'gemini-api') {
                    return undefined;
                }
                return customProvider;
            }
        });

        const catalogA = await runtime.getProviderModels('gemini-api');
        const catalogB = await runtime.getProviderModels('gemini-api');

        expect(catalogA).toEqual(catalogB);
        expect(customProvider.catalogCalls).toBe(1);
    });

    it('falls back to static provider catalog when dynamic catalog is invalid', async () => {
        const runtime = createProviderRuntime({
            runtimeMode: 'web',
            providerFactory(providerId) {
                if (providerId !== 'gemini-api') {
                    return undefined;
                }
                return new InvalidCatalogProvider();
            }
        });

        await expect(runtime.getProviderModels('gemini-api')).resolves.toEqual({
            models: [
                {
                    id: 'gemini-2.5-flash',
                    name: 'Gemini 2.5 Flash',
                    options: [expect.objectContaining({ key: 'deep_research', type: 'boolean' })]
                },
                {
                    id: 'gemini-2.0-flash',
                    name: 'Gemini 2.0 Flash',
                    options: [expect.objectContaining({ key: 'deep_research', type: 'boolean' })]
                },
                {
                    id: 'gemini-2.5-pro',
                    name: 'Gemini 2.5 Pro',
                    options: [expect.objectContaining({ key: 'deep_research', type: 'boolean' })]
                }
            ],
            defaultModel: 'gemini-2.5-flash'
        });
    });

    it('applies configured preferred default model when the dynamic catalog contains a match', async () => {
        const runtime = createProviderRuntime({
            runtimeMode: 'extension',
            providerFactory(providerId) {
                if (providerId !== 'chatgpt-web') {
                    return undefined;
                }

                return {
                    id: 'chatgpt-web',
                    async getAvailableModels() {
                        return {
                            models: [
                                { id: 'gpt-5.3', name: 'GPT-5.3' },
                                { id: 'gpt-5.4-thinking', name: 'GPT-5.4 Thinking' }
                            ],
                            defaultModel: 'gpt-5.3'
                        };
                    },
                    async checkAuth() {
                        return true;
                    },
                    async sendMessage(_prompt: string, _options: SendMessageOptions, onUpdate: (update: ProviderStreamUpdate) => void) {
                        onUpdate({ text: 'ok' });
                        return { text: 'ok', conversationId: 'c', messageId: 'm' };
                    },
                    abort() {}
                } satisfies IModelProvider;
            }
        });

        await expect(runtime.getProviderModels('chatgpt-web')).resolves.toEqual({
            models: [
                { id: 'gpt-5.3', name: 'GPT-5.3' },
                { id: 'gpt-5.4-thinking', name: 'GPT-5.4 Thinking' }
            ],
            defaultModel: 'gpt-5.4-thinking'
        });
    });

    it('throws when configured preferred default model does not exist in the dynamic catalog', async () => {
        const runtime = createProviderRuntime({
            runtimeMode: 'extension',
            providerFactory(providerId) {
                if (providerId !== 'chatgpt-web') {
                    return undefined;
                }

                return {
                    id: 'chatgpt-web',
                    async getAvailableModels() {
                        return {
                            models: [{ id: 'gpt-5.3', name: 'GPT-5.3' }],
                            defaultModel: 'gpt-5.3'
                        };
                    },
                    async checkAuth() {
                        return true;
                    },
                    async sendMessage(_prompt: string, _options: SendMessageOptions, onUpdate: (update: ProviderStreamUpdate) => void) {
                        onUpdate({ text: 'ok' });
                        return { text: 'ok', conversationId: 'c', messageId: 'm' };
                    },
                    abort() {}
                } satisfies IModelProvider;
            }
        });

        await expect(runtime.getProviderModels('chatgpt-web')).rejects.toThrow(
            "Configured default model 'gpt5.4thinking' was not found"
        );
    });
});
