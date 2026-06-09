import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
    app: {
        on: vi.fn()
    },
    BrowserWindow: vi.fn(),
    session: {
        fromPartition: vi.fn(() => ({}))
    }
}));

function createWindowHarness() {
    return {
        loadURL: vi.fn().mockResolvedValue(undefined),
        show: vi.fn(),
        hide: vi.fn(),
        destroy: vi.fn(),
        isDestroyed: vi.fn().mockReturnValue(false),
        webContents: {
            getURL: vi.fn().mockReturnValue('')
        }
    };
}

describe('createControlledPageManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('reuses a provider page and only reloads when targetUrl changes', async () => {
        const { createControlledPageManager } = await import('./controlledPageManager');
        const windowHarness = createWindowHarness();
        const createWindow = vi.fn().mockReturnValue(windowHarness);
        const manager = createControlledPageManager({ createWindow });

        await manager.ensurePage('gemini-web', {
            targetUrl: 'https://gemini.google.com/app',
            visible: false
        });
        windowHarness.webContents.getURL.mockReturnValue('https://gemini.google.com/app');
        await manager.ensurePage('gemini-web', {
            targetUrl: 'https://gemini.google.com/app',
            visible: true
        });

        expect(createWindow).toHaveBeenCalledTimes(1);
        expect(windowHarness.loadURL).toHaveBeenCalledTimes(1);
        expect(windowHarness.hide).toHaveBeenCalledTimes(1);
        expect(windowHarness.show).toHaveBeenCalledTimes(1);
    });

    it('recreates the page when preloadPath changes', async () => {
        const { createControlledPageManager } = await import('./controlledPageManager');
        const firstWindow = createWindowHarness();
        const secondWindow = createWindowHarness();
        const createWindow = vi.fn()
            .mockReturnValueOnce(firstWindow)
            .mockReturnValueOnce(secondWindow);
        const manager = createControlledPageManager({ createWindow });

        await manager.ensurePage('gemini-web', {
            targetUrl: 'https://gemini.google.com/app',
            preloadPath: '/tmp/a.cjs'
        });
        await manager.ensurePage('gemini-web', {
            targetUrl: 'https://gemini.google.com/app',
            preloadPath: '/tmp/b.cjs'
        });

        expect(createWindow).toHaveBeenCalledTimes(2);
        expect(firstWindow.destroy).toHaveBeenCalledTimes(1);
    });

    it('reloads the page when forceReload is true even if targetUrl is unchanged', async () => {
        const { createControlledPageManager } = await import('./controlledPageManager');
        const windowHarness = createWindowHarness();
        const createWindow = vi.fn().mockReturnValue(windowHarness);
        const manager = createControlledPageManager({ createWindow });

        await manager.ensurePage('gemini-web', {
            targetUrl: 'https://gemini.google.com/app',
            visible: false
        });
        windowHarness.webContents.getURL.mockReturnValue('https://gemini.google.com/app');
        await manager.ensurePage('gemini-web', {
            targetUrl: 'https://gemini.google.com/app',
            visible: false,
            forceReload: true
        });

        expect(createWindow).toHaveBeenCalledTimes(1);
        expect(windowHarness.loadURL).toHaveBeenCalledTimes(2);
    });
});
