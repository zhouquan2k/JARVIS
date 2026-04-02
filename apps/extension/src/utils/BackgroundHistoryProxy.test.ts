import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExternalHistoryError } from '@packages/core/src';
import { BackgroundHistoryProxy } from './BackgroundHistoryProxy';

type PortHarness = ReturnType<typeof createPortHarness>;

function createPortHarness() {
    let onDisconnect: (() => void) | undefined;
    let onMessage: ((message: unknown) => void) | undefined;

    return {
        port: {
            postMessage: vi.fn(),
            onDisconnect: {
                addListener: vi.fn((listener: () => void) => {
                    onDisconnect = listener;
                })
            },
            onMessage: {
                addListener: vi.fn((listener: (message: unknown) => void) => {
                    onMessage = listener;
                })
            }
        },
        emitMessage(message: unknown) {
            onMessage?.(message);
        },
        disconnect() {
            onDisconnect?.();
        }
    };
}

describe('BackgroundHistoryProxy', () => {
    afterEach(() => {
        // @ts-expect-error test cleanup
        delete globalThis.chrome;
    });

    it('reconnects once and replays a pending history-list request after disconnect', async () => {
        const firstPort = createPortHarness();
        const secondPort = createPortHarness();
        const connect = vi.fn()
            .mockReturnValueOnce(firstPort.port)
            .mockReturnValueOnce(secondPort.port);

        // @ts-expect-error simplified test double
        globalThis.chrome = {
            runtime: {
                connect
            }
        };

        const provider = new BackgroundHistoryProxy('gemini-web', { channelId: 'history-test-channel' });
        const resultPromise = provider.getHistoryList({ query: 'incident' });

        const firstMessage = firstPort.port.postMessage.mock.calls[0]?.[0];
        expect(firstMessage).toEqual(expect.objectContaining({
            action: 'GET_HISTORY_LIST',
            providerId: 'gemini-web',
            channelId: 'history-test-channel',
            query: 'incident'
        }));

        firstPort.disconnect();

        expect(connect).toHaveBeenCalledTimes(2);
        expect(secondPort.port.postMessage).toHaveBeenCalledWith(firstMessage);

        secondPort.emitMessage({
            type: 'DONE',
            requestId: firstMessage.requestId,
            channelId: firstMessage.channelId,
            result: [
                {
                    id: 'gemini-history-1',
                    title: 'Gemini Chat',
                    updatedAt: 1,
                    origin: 'gemini-web'
                }
            ]
        });

        await expect(resultPromise).resolves.toEqual([
            {
                id: 'gemini-history-1',
                title: 'Gemini Chat',
                updatedAt: 1,
                origin: 'gemini-web'
            }
        ]);
    });

    it('rejects the request when the retried history-detail connection disconnects again', async () => {
        const firstPort = createPortHarness();
        const secondPort = createPortHarness();
        const connect = vi.fn()
            .mockReturnValueOnce(firstPort.port)
            .mockReturnValueOnce(secondPort.port);

        // @ts-expect-error simplified test double
        globalThis.chrome = {
            runtime: {
                connect
            }
        };

        const provider = new BackgroundHistoryProxy('gemini-web', { channelId: 'history-test-channel' });
        const resultPromise = provider.getHistoryDetail('gemini-history-1');

        firstPort.disconnect();
        secondPort.disconnect();

        await expect(resultPromise).rejects.toThrow('Background history proxy connection disconnected');
        expect(connect).toHaveBeenCalledTimes(2);
    });

    it('preserves structured external history errors from background responses', async () => {
        const port = createPortHarness();

        // @ts-expect-error simplified test double
        globalThis.chrome = {
            runtime: {
                connect: vi.fn().mockReturnValue(port.port)
            }
        };

        const provider = new BackgroundHistoryProxy('gemini-web', { channelId: 'history-test-channel' });
        const resultPromise = provider.getHistoryList();

        const message = port.port.postMessage.mock.calls[0]?.[0];
        port.emitMessage({
            type: 'ERROR',
            requestId: message.requestId,
            channelId: message.channelId,
            error: 'Gemini 页面当前未登录。',
            historyErrorCode: 'AUTH_REQUIRED',
            historyProviderId: 'gemini-web'
        });

        await expect(resultPromise).rejects.toMatchObject({
            name: 'ExternalHistoryError',
            code: 'AUTH_REQUIRED',
            providerId: 'gemini-web'
        } satisfies Partial<ExternalHistoryError>);
    });
});
