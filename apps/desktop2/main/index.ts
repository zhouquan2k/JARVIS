import { app, BrowserWindow, nativeImage } from 'electron';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    buildDesktopControlledPageRegistry,
    resolveDesktopProviderLoginConfig
} from '@plugins/ai-agent/desktop';
import { createAuthWindowManager } from './authWindow';
import { registerProviderLoginIpc } from './authIpc';
import { registerBrowserAutomationIpc } from './browserAutomationIpc';
import { registerContextProviderIpc } from './contextProviderIpc';
import { createControlledPageManager } from './controlledPageManager';
import { registerControlledPageIpc } from './controlledPageIpc';
import { registerDesktopFetchIpc } from './fetchIpc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rendererDistDir = join(__dirname, '../../renderer');
const preloadPath = join(__dirname, 'preload.cjs');
const controlledPagePreloadPath = join(__dirname, 'controlled-page.preload.cjs');

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
let disposeFetchIpc: (() => void) | null = null;

const authWindowManager = createAuthWindowManager({
    resolveProviderLoginConfig: resolveDesktopProviderLoginConfig
});

function deriveServerOrigin(): string {
    const contextBaseUrl = process.env.CHATPRISM_CONTEXT_BASE_URL?.trim();
    if (contextBaseUrl) {
        try {
            const url = new URL(contextBaseUrl);
            return `${url.protocol}//${url.host}`;
        } catch {
            // fall through
        }
    }
    return 'http://127.0.0.1:8787';
}

function useLocalRendererBundle(): boolean {
    const flag = process.env.CHATPRISM_DESKTOP_USE_LOCAL_BUNDLE?.trim().toLowerCase();
    return flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on';
}

function resolveRendererApiBaseUrl(envKey: string, fallbackPath: string): string {
    const explicit = process.env[envKey]?.trim();
    if (explicit) {
        return explicit;
    }

    return `${deriveServerOrigin()}${fallbackPath}`;
}

function prepareRendererRuntimeEnv(mode: 'dev-server' | 'server-origin' | 'local-bundle'): void {
    if (mode === 'local-bundle') {
        process.env.CHATPRISM_RENDERER_CONTEXT_BASE_URL = resolveRendererApiBaseUrl('CHATPRISM_CONTEXT_BASE_URL', '/api/context');
        process.env.CHATPRISM_RENDERER_SYNC_BASE_URL = resolveRendererApiBaseUrl('CHATPRISM_SYNC_BASE_URL', '/api/sync');
        process.env.CHATPRISM_RENDERER_CODEX_BASE_URL = resolveRendererApiBaseUrl('CHATPRISM_CODEX_BASE_URL', '/api/codex');
        process.env.CHATPRISM_RENDERER_PROVIDER_CONFIG_BASE_URL = resolveRendererApiBaseUrl('CHATPRISM_PROVIDER_CONFIG_BASE_URL', '/api/provider-configs');
        return;
    }

    process.env.CHATPRISM_RENDERER_CONTEXT_BASE_URL = '/api/context';
    process.env.CHATPRISM_RENDERER_SYNC_BASE_URL = '/api/sync';
    process.env.CHATPRISM_RENDERER_CODEX_BASE_URL = '/api/codex';
    process.env.CHATPRISM_RENDERER_PROVIDER_CONFIG_BASE_URL = '/api/provider-configs';
}

function getRendererEntryTarget(): { mode: 'dev-server' | 'server-origin' | 'local-bundle'; url?: string } {
    const devServerUrl = process.env.CHATPRISM_DESKTOP_DEV_SERVER_URL;
    if (devServerUrl) {
        prepareRendererRuntimeEnv('dev-server');
        return {
            mode: 'dev-server',
            url: devServerUrl
        };
    }

    if (useLocalRendererBundle()) {
        prepareRendererRuntimeEnv('local-bundle');
        return {
            mode: 'local-bundle'
        };
    }

    prepareRendererRuntimeEnv('server-origin');
    return {
        mode: 'server-origin',
        url: `${deriveServerOrigin()}/`
    };
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

    const entryTarget = getRendererEntryTarget();
    if (entryTarget.mode === 'local-bundle') {
        await window.loadFile(join(rendererDistDir, 'index.html'));
        return;
    }

    if (!entryTarget.url) {
        throw new Error('Desktop renderer entry URL is not configured.');
    }

    await window.loadURL(entryTarget.url);
}

function wireIpc() {
    disposeProviderLoginIpc = registerProviderLoginIpc({
        authWindowManager
    });
    disposeBrowserAutomationIpc = registerBrowserAutomationIpc();
    disposeControlledPageIpc = registerControlledPageIpc({
        controlledPageManager,
        controlledPageRegistry: buildDesktopControlledPageRegistry(controlledPagePreloadPath)
    });
    disposeFetchIpc = registerDesktopFetchIpc();
    disposeContextIpc = registerContextProviderIpc({
        knowledgeRoot: process.env.CHATPRISM_KNOWLEDGE_ROOT
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
    disposeFetchIpc?.();
    disposeFetchIpc = null;
    disposeProviderLoginIpc?.();
    disposeProviderLoginIpc = null;
    authWindowManager.dispose();
});
