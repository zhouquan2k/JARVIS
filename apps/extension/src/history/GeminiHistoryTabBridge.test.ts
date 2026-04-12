import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeminiHistoryRemoteConfig } from '@packages/core/src';
import { GeminiHistoryTabBridge } from './GeminiHistoryTabBridge';

const CONFIG: GeminiHistoryRemoteConfig = {
    providerId: 'gemini-web',
    version: 'test-1',
    matchOrigins: ['https://gemini.google.com'],
    selectors: {
        historyListContainer: '.history-list',
        historyListItem: '.history-item',
        historyTitle: '.history-title',
        historyLink: 'a',
        conversationRoot: 'main',
        userBubble: '.user',
        assistantBubble: '.assistant'
    },
    healthCheck: {
        requiredSelectors: ['historyListContainer'],
        maxMissingCount: 1
    }
};

function createChromeStub() {
    const onUpdated = {
        addListener: vi.fn(),
        removeListener: vi.fn()
    };

    return {
        tabs: {
            query: vi.fn(),
            get: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            remove: vi.fn(),
            sendMessage: vi.fn(),
            onUpdated
        },
        scripting: {
            executeScript: vi.fn()
        }
    } as unknown as typeof chrome;
}

describe('GeminiHistoryTabBridge', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('reuses an already open Gemini tab instead of creating a new one', async () => {
        const chromeStub = createChromeStub();
        chromeStub.tabs.query = vi.fn().mockResolvedValue([
            {
                id: 42,
                url: 'https://gemini.google.com/app',
                status: 'complete',
                active: true
            }
        ]);
        chromeStub.tabs.get = vi.fn().mockResolvedValue({
            id: 42,
            url: 'https://gemini.google.com/app',
            status: 'complete',
            active: true
        });
        chromeStub.tabs.sendMessage = vi.fn()
            .mockResolvedValueOnce({ ok: true, data: { ready: true } })
            .mockResolvedValueOnce({
                ok: true,
                data: [
                    {
                        id: 'gemini-1',
                        title: 'Gemini',
                        updatedAt: 1
                    }
                ]
            });

        vi.stubGlobal('chrome', chromeStub);

        const bridge = new GeminiHistoryTabBridge();
        const result = await bridge.getHistoryList(CONFIG);

        expect(result).toHaveLength(1);
        expect(chromeStub.tabs.query).toHaveBeenCalledWith({
            url: ['https://gemini.google.com/*']
        });
        expect(chromeStub.tabs.create).not.toHaveBeenCalled();
        expect(chromeStub.tabs.update).not.toHaveBeenCalled();
        expect(chromeStub.tabs.remove).not.toHaveBeenCalled();
    });

    it('forwards the history search query to the Gemini content script request', async () => {
        const chromeStub = createChromeStub();
        chromeStub.tabs.query = vi.fn().mockResolvedValue([
            {
                id: 42,
                url: 'https://gemini.google.com/app',
                status: 'complete',
                active: true
            }
        ]);
        chromeStub.tabs.get = vi.fn().mockResolvedValue({
            id: 42,
            url: 'https://gemini.google.com/app',
            status: 'complete',
            active: true
        });
        chromeStub.tabs.sendMessage = vi.fn()
            .mockResolvedValueOnce({ ok: true, data: { ready: true } })
            .mockResolvedValueOnce({ ok: true, data: [] });

        vi.stubGlobal('chrome', chromeStub);

        const bridge = new GeminiHistoryTabBridge();
        await bridge.getHistoryList(CONFIG, { query: 'incident' });

        expect(chromeStub.tabs.sendMessage).toHaveBeenLastCalledWith(42, expect.objectContaining({
            action: 'GET_HISTORY_LIST',
            query: 'incident'
        }));
    });

    it('creates and keeps an inactive Gemini tab when none is already open', async () => {
        const chromeStub = createChromeStub();
        chromeStub.tabs.query = vi.fn().mockResolvedValue([]);
        chromeStub.tabs.create = vi.fn().mockResolvedValue({
            id: 7,
            url: 'https://gemini.google.com/app',
            status: 'loading',
            active: false
        });
        chromeStub.tabs.get = vi.fn().mockResolvedValue({
            id: 7,
            url: 'https://gemini.google.com/app',
            status: 'complete',
            active: false
        });
        chromeStub.tabs.sendMessage = vi.fn()
            .mockResolvedValueOnce({ ok: true, data: { ready: true } })
            .mockResolvedValueOnce({
                ok: true,
                data: [
                    {
                        id: 'gemini-1',
                        title: 'Gemini',
                        updatedAt: 1
                    }
                ]
            });
        vi.stubGlobal('chrome', chromeStub);

        const bridge = new GeminiHistoryTabBridge();
        const result = await bridge.getHistoryList(CONFIG);

        expect(result).toHaveLength(1);
        expect(chromeStub.tabs.create).toHaveBeenCalledWith({
            url: 'https://gemini.google.com/app',
            active: false
        });
        expect(chromeStub.tabs.remove).not.toHaveBeenCalled();
    });

    it('waits for the Gemini content script ping before sending the actual request', async () => {
        const chromeStub = createChromeStub();
        chromeStub.tabs.query = vi.fn().mockResolvedValue([]);
        chromeStub.tabs.create = vi.fn().mockResolvedValue({
            id: 9,
            url: 'https://gemini.google.com/app',
            status: 'loading',
            active: false
        });
        chromeStub.tabs.get = vi.fn().mockResolvedValue({
            id: 9,
            url: 'https://gemini.google.com/app',
            status: 'complete',
            active: false
        });
        chromeStub.tabs.sendMessage = vi.fn()
            .mockRejectedValueOnce(new Error('Receiving end does not exist'))
            .mockRejectedValueOnce(new Error('Receiving end does not exist'))
            .mockResolvedValueOnce({ ok: true, data: { ready: true } })
            .mockResolvedValueOnce({
                ok: true,
                data: [
                    {
                        id: 'gemini-1',
                        title: 'Gemini',
                        updatedAt: 1
                    }
                ]
            });
        vi.stubGlobal('chrome', chromeStub);

        const bridge = new GeminiHistoryTabBridge();
        const result = await bridge.getHistoryList(CONFIG);

        expect(result).toHaveLength(1);
        expect(chromeStub.tabs.sendMessage).toHaveBeenCalledTimes(4);
        expect(chromeStub.scripting.executeScript).toHaveBeenCalledTimes(2);
    });

    it('waits for an already open Gemini tab to finish loading before pinging the content script', async () => {
        const chromeStub = createChromeStub();
        chromeStub.tabs.query = vi.fn().mockResolvedValue([
            {
                id: 21,
                url: 'https://gemini.google.com/app',
                status: 'loading',
                active: true
            }
        ]);
        chromeStub.tabs.get = vi.fn()
            .mockResolvedValueOnce({
                id: 21,
                url: 'https://gemini.google.com/app',
                status: 'loading',
                active: true
            })
            .mockResolvedValueOnce({
                id: 21,
                url: 'https://gemini.google.com/app',
                status: 'complete',
                active: true
            });
        chromeStub.tabs.sendMessage = vi.fn()
            .mockResolvedValueOnce({ ok: true, data: { ready: true } })
            .mockResolvedValueOnce({
                ok: true,
                data: [
                    {
                        id: 'gemini-1',
                        title: 'Gemini',
                        updatedAt: 1
                    }
                ]
            });
        chromeStub.tabs.onUpdated.addListener = vi.fn((listener: (tabId: number, info: chrome.tabs.TabChangeInfo) => void) => {
            listener(21, { status: 'complete' });
        });
        vi.stubGlobal('chrome', chromeStub);

        const bridge = new GeminiHistoryTabBridge();
        const result = await bridge.getHistoryList(CONFIG);

        expect(result).toHaveLength(1);
        expect(chromeStub.tabs.onUpdated.addListener).toHaveBeenCalledTimes(1);
        expect(chromeStub.tabs.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('surfaces auth-required when the tab is redirected to Google login', async () => {
        const chromeStub = createChromeStub();
        chromeStub.tabs.query = vi.fn().mockResolvedValue([]);
        chromeStub.tabs.create = vi.fn().mockResolvedValue({
            id: 10,
            url: 'https://accounts.google.com/ServiceLogin',
            status: 'complete',
            active: false
        });
        chromeStub.tabs.get = vi.fn().mockResolvedValue({
            id: 10,
            url: 'https://accounts.google.com/ServiceLogin',
            status: 'complete',
            active: false
        });
        chromeStub.tabs.sendMessage = vi.fn().mockRejectedValue(new Error('Receiving end does not exist'));
        vi.stubGlobal('chrome', chromeStub);

        const bridge = new GeminiHistoryTabBridge();

        await expect(bridge.getHistoryList(CONFIG)).rejects.toMatchObject({
            name: 'ExternalHistoryError',
            code: 'AUTH_REQUIRED',
            message: 'The Gemini tab navigated to a sign-in page. Please sign in and try again.'
        });
    });
});
