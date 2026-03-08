import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackgroundProxyProvider } from './BackgroundProxyProvider';

describe('BackgroundProxyProvider', () => {
    afterEach(() => {
        // @ts-expect-error test cleanup
        delete globalThis.chrome;
    });

    it('proxies getAvailableModels through the background channel', async () => {
        let onMessage: ((message: unknown) => void) | undefined;
        const postMessage = vi.fn((message: { requestId: string; channelId: string; action: string; providerId: string }) => {
            onMessage?.({
                type: 'DONE',
                requestId: message.requestId,
                channelId: message.channelId,
                result: {
                    models: [{ id: 'gpt-4o', name: 'GPT-4o' }],
                    defaultModel: 'gpt-4o'
                }
            });
        });

        // @ts-expect-error simplified test double
        globalThis.chrome = {
            runtime: {
                connect: () => ({
                    postMessage,
                    onDisconnect: { addListener: vi.fn() },
                    onMessage: {
                        addListener: (listener: (message: unknown) => void) => {
                            onMessage = listener;
                        }
                    }
                })
            }
        };

        const provider = new BackgroundProxyProvider('chatgpt-web', { channelId: 'test-channel' });
        await expect(provider.getAvailableModels()).resolves.toEqual({
            models: [{ id: 'gpt-4o', name: 'GPT-4o' }],
            defaultModel: 'gpt-4o'
        });
        expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
            action: 'GET_AVAILABLE_MODELS',
            providerId: 'chatgpt-web',
            channelId: 'test-channel'
        }));
    });
});
