import { describe, expect, it, vi } from 'vitest';
import { createModelProviderRuntime } from './createModelProviderRuntime';
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

describe('createModelProviderRuntime', () => {
    it('filters providers by runtimeMode', () => {
        const runtime = createModelProviderRuntime({ runtimeMode: 'web' });
        const providers = runtime.getProviderCatalog();
        expect(providers.every((provider) => provider.supportedRuntimeModes.includes('web'))).toBe(true);
    });

    it('filters providers by desktop runtimeMode', () => {
        const runtime = createModelProviderRuntime({ runtimeMode: 'desktop' });
        const providers = runtime.getProviderCatalog();
        expect(providers.length).toBeGreaterThan(0);
        expect(providers.every((provider) => provider.supportedRuntimeModes.includes('desktop'))).toBe(true);
    });

    it('returns model provider instances with IModelProvider contract', () => {
        const runtime = createModelProviderRuntime({ runtimeMode: 'extension' });
        const provider = runtime.getProvider('gemini-api');
        expect(provider.id).toBe('gemini-api');
        expect(typeof provider.checkAuth).toBe('function');
        expect(typeof provider.sendMessage).toBe('function');
        expect(typeof provider.abort).toBe('function');
    });

    it('exposes chatgpt-codex in supported runtime modes', () => {
        const runtime = createModelProviderRuntime({ runtimeMode: 'web' });
        expect(runtime.getProviderCatalog().some((provider) => provider.id === 'chatgpt-codex')).toBe(true);
        expect(runtime.getProvider('chatgpt-codex').id).toBe('chatgpt-codex');
    });

    it('returns cached instance in default mode', () => {
        const runtime = createModelProviderRuntime({ runtimeMode: 'web' });
        const providerA = runtime.getProvider('gemini-api');
        const providerB = runtime.getProvider('gemini-api');
        expect(providerA).toBe(providerB);
    });

    it('returns fresh instance when fresh option is true', () => {
        const runtime = createModelProviderRuntime({ runtimeMode: 'web' });
        const cached = runtime.getProvider('gemini-api');
        const freshA = runtime.getProvider('gemini-api', { fresh: true });
        const freshB = runtime.getProvider('gemini-api', { fresh: true });

        expect(freshA).not.toBe(cached);
        expect(freshB).not.toBe(cached);
        expect(freshA).not.toBe(freshB);
        expect(runtime.getProvider('gemini-api')).toBe(cached);
    });

    it('uses injected credentials with higher priority', async () => {
        const runtime = createModelProviderRuntime({
            runtimeMode: 'web',
            credentials: {
                geminiApiKey: 'injected-key'
            }
        });

        const provider = runtime.getProvider('gemini-api');
        await expect(provider.checkAuth()).resolves.toBe(true);
    });

    it('uses custom providerFactory when provided', () => {
        const runtime = createModelProviderRuntime({
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

    it('passes resolved provider options into default factories', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ accessToken: 'token-from-host' })
        });
        const cookieStore = {
            get: vi.fn().mockResolvedValue({ value: 'device-from-host' })
        };

        const runtime = createModelProviderRuntime({
            runtimeMode: 'desktop',
            providerOptionsResolver(providerId) {
                if (providerId !== 'chatgpt-web') {
                    return undefined;
                }

                return {
                    requestClient: { fetch: fetchMock },
                    cookieStore,
                    userAgent: 'Desktop Runtime UA'
                };
            }
        });

        await expect(runtime.getProvider('chatgpt-web').checkAuth()).resolves.toBe(true);
        expect(fetchMock).toHaveBeenCalledWith('https://chatgpt.com/api/auth/session', {
            credentials: 'include'
        });
        expect(cookieStore.get).not.toHaveBeenCalled();
    });

    it('passes resolved codex baseUrl into the default chatgpt-codex factory', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            text: async () => JSON.stringify({ authenticated: true })
        });

        const runtime = createModelProviderRuntime({
            runtimeMode: 'web',
            providerOptionsResolver(providerId) {
                if (providerId !== 'chatgpt-codex') {
                    return undefined;
                }

                return {
                    baseUrl: 'http://127.0.0.1:8787/api/codex',
                    requestClient: { fetch: fetchMock }
                };
            }
        });

        await expect(runtime.getProvider('chatgpt-codex').checkAuth()).resolves.toBe(true);
        expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8787/api/codex/auth/status', expect.objectContaining({
            method: 'GET'
        }));
    });

    it('falls back to the static auto catalog when chatgpt-codex dynamic models fail', async () => {
        const runtime = createModelProviderRuntime({
            runtimeMode: 'web',
            providerFactory(providerId) {
                if (providerId !== 'chatgpt-codex') {
                    return undefined;
                }
                return {
                    id: 'chatgpt-codex',
                    async getAvailableModels() {
                        throw new Error('boom');
                    },
                    async checkAuth() {
                        return true;
                    },
                    async sendMessage() {
                        return {
                            text: 'ok',
                            conversationId: 'conv',
                            messageId: 'msg'
                        };
                    },
                    abort() {}
                };
            }
        });

        await expect(runtime.getProviderModels('chatgpt-codex')).resolves.toEqual({
            models: [
                {
                    id: 'auto',
                    name: 'Auto (Default)',
                    nameKey: 'model.autoDefault',
                    options: [
                        expect.objectContaining({ key: 'web_search', type: 'boolean' }),
                        expect.objectContaining({ key: 'deep_research', type: 'boolean' })
                    ]
                },
                {
                    id: 'gpt-5.4',
                    name: 'gpt-5.4',
                    options: [
                        expect.objectContaining({ key: 'web_search', type: 'boolean' }),
                        expect.objectContaining({ key: 'deep_research', type: 'boolean' })
                    ]
                }
            ],
            defaultModel: 'auto'
        });
    });

    it('returns provider-driven model catalogs', async () => {
        const customProvider = new CustomGeminiProvider();
        const runtime = createModelProviderRuntime({
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
        const runtime = createModelProviderRuntime({
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
        const runtime = createModelProviderRuntime({
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
                    nameKey: 'model.gemini25Flash',
                    options: [
                        expect.objectContaining({ key: 'web_search', type: 'boolean' }),
                        expect.objectContaining({ key: 'deep_research', type: 'boolean' })
                    ]
                },
                {
                    id: 'gemini-2.0-flash',
                    name: 'Gemini 2.0 Flash',
                    nameKey: 'model.gemini20Flash',
                    options: [
                        expect.objectContaining({ key: 'web_search', type: 'boolean' }),
                        expect.objectContaining({ key: 'deep_research', type: 'boolean' })
                    ]
                },
                {
                    id: 'gemini-pro-latest',
                    name: 'Gemini Pro Latest',
                    nameKey: 'model.geminiProLatest',
                    options: [
                        expect.objectContaining({ key: 'web_search', type: 'boolean' }),
                        expect.objectContaining({ key: 'deep_research', type: 'boolean' })
                    ]
                },
                {
                    id: 'gemini-2.5-pro',
                    name: 'Gemini 2.5 Pro',
                    nameKey: 'model.gemini25Pro',
                    options: [
                        expect.objectContaining({ key: 'web_search', type: 'boolean' }),
                        expect.objectContaining({ key: 'deep_research', type: 'boolean' })
                    ]
                }
            ],
            defaultModel: 'gemini-pro-latest'
        });
    });

    it('applies configured preferred default model when the dynamic catalog contains a match', async () => {
        const runtime = createModelProviderRuntime({
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

    it('falls back to the provider catalog default when configured preferred default model does not exist in the dynamic catalog', async () => {
        const runtime = createModelProviderRuntime({
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

        await expect(runtime.getProviderModels('chatgpt-web')).resolves.toEqual({
            models: [{ id: 'gpt-5.3', name: 'GPT-5.3' }],
            defaultModel: 'gpt-5.3'
        });
    });
});
