import { describe, expect, it } from 'vitest';
import { createProviderRuntime } from './createProviderRuntime';
import type { IModelProvider } from '../interfaces/IModelProvider';

class CustomGeminiProvider implements IModelProvider {
    public id = 'custom-gemini';

    async checkAuth(): Promise<boolean> {
        return true;
    }

    async sendMessage(
        _prompt: string,
        _options: {
            context?: { parentMessageId?: string; conversationId?: string };
            modelId?: string;
        },
        onUpdate: (chunk: string) => void
    ): Promise<{ text: string; conversationId: string; messageId: string }> {
        onUpdate('custom');
        return {
            text: 'custom',
            conversationId: 'conversation-id',
            messageId: 'message-id'
        };
    }

    abort(): void {}
}

describe('createProviderRuntime', () => {
    it('filters providers by runtimeMode', () => {
        const runtime = createProviderRuntime({ runtimeMode: 'web' });
        const providers = runtime.getAvailableProviders();
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
});
