import { app, BrowserWindow, nativeImage } from 'electron';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveGeminiHistoryRuntimeConfig } from '@packages/core/config';
import { createAuthWindowManager } from './authWindow';
import { registerProviderLoginIpc } from './authIpc';
import { registerBrowserAutomationIpc } from './browserAutomationIpc';
import { createControlledPageManager } from './controlledPageManager';
import { createDesktopMainHostContext } from './createDesktopMainHostContext';
import { registerContextIpc } from './contextIpc';
import { registerControlledPageIpc } from './controlledPageIpc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rendererDistDir = join(__dirname, '../../renderer');
const preloadPath = join(__dirname, 'preload.cjs');
const geminiHistoryPreloadPath = join(__dirname, 'gemini-history.preload.cjs');

function resolveDesktopBrandIconPath(): string {
    const bundledPngIconPath = join(rendererDistDir, 'jarvis.png');
    if (existsSync(bundledPngIconPath)) {
        return bundledPngIconPath;
    }

    const publicPngIconPath = join(__dirname, '../public/jarvis.png');
    if (existsSync(publicPngIconPath)) {
        return publicPngIconPath;
    }

    return publicPngIconPath;
}

function applyDesktopBranding(): void {
    if (process.platform !== 'darwin' || typeof app.dock?.setIcon !== 'function') {
        return;
    }

    const iconPath = resolveDesktopBrandIconPath();
    const icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
        console.warn('Failed to load desktop brand icon for macOS dock.', iconPath);
        return;
    }

    app.dock.setIcon(icon);
}

const controlledPageManager = createControlledPageManager();
let disposeProviderLoginIpc: (() => void) | null = null;
let disposeContextIpc: (() => void) | null = null;
let disposeControlledPageIpc: (() => void) | null = null;
let disposeBrowserAutomationIpc: (() => void) | null = null;
const desktopHostContext = createDesktopMainHostContext({
    controlledPageManager,
    preloadPath: geminiHistoryPreloadPath
});

async function probeGeminiHistoryReadyFromHostContext(options: { forceReload?: boolean } = {}): Promise<boolean> {
    const bridge = desktopHostContext.getCapability<{
        probeHistoryListReady(
            config: Record<string, unknown>,
            options?: { forceReload?: boolean }
        ): Promise<boolean>;
    }>('browser-tabs');
    if (!bridge) {
        return false;
    }

    const config = resolveGeminiHistoryRuntimeConfig({ env: process.env });
    return bridge.probeHistoryListReady(config, options);
}

const authWindowManager = createAuthWindowManager({
    async probeGeminiHistoryReady() {
        try {
            return await probeGeminiHistoryReadyFromHostContext();
        } catch (error) {
            console.warn('Failed to probe Gemini history readiness from auth window.', error);
            return false;
        }
    }
});

function getRendererEntryUrl(): string {
    const devServerUrl = process.env.CHATPRISM_DESKTOP_DEV_SERVER_URL;
    if (devServerUrl) {
        return devServerUrl;
    }

    return `file://${join(rendererDistDir, 'index.html')}`;
}

async function createMainWindow() {
    const window = new BrowserWindow({
        title: 'JARVIS.app',
        width: 1440,
        height: 960,
        minWidth: 1100,
        minHeight: 720,
        autoHideMenuBar: true,
        icon: resolveDesktopBrandIconPath(),
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    const entryUrl = getRendererEntryUrl();
    if (entryUrl.startsWith('file://')) {
        await window.loadFile(join(rendererDistDir, 'index.html'));
    } else {
        await window.loadURL(entryUrl);
    }
}

function wireIpc() {
    disposeProviderLoginIpc = registerProviderLoginIpc({
        authWindowManager
    });
    disposeBrowserAutomationIpc = registerBrowserAutomationIpc();
    disposeControlledPageIpc = registerControlledPageIpc({
        controlledPageManager,
        preloadRegistry: { 'gemini-web': geminiHistoryPreloadPath }
    });
    disposeContextIpc = registerContextIpc({
        contextBaseUrl: process.env.CHATPRISM_CONTEXT_BASE_URL
    });
}

app.whenReady().then(async () => {
    app.setName('JARVIS.app');
    app.setAboutPanelOptions({
        applicationName: 'JARVIS.app'
    });
    wireIpc();
    applyDesktopBranding();
    await createMainWindow();

    app.on('activate', async () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            await createMainWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    controlledPageManager.dispose();
    disposeContextIpc?.();
    disposeContextIpc = null;
    disposeControlledPageIpc?.();
    disposeControlledPageIpc = null;
    disposeBrowserAutomationIpc?.();
    disposeBrowserAutomationIpc = null;
    disposeProviderLoginIpc?.();
    disposeProviderLoginIpc = null;
    authWindowManager.dispose();
});
