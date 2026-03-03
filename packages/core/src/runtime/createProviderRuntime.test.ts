import { describe, expect, it } from 'vitest';
import { createProviderRuntime } from './createProviderRuntime';

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
});
