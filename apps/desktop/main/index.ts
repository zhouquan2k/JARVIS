import { app, BrowserWindow, ipcMain, nativeImage } from 'electron';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_GEMINI_HISTORY_PAGE_URL } from '@packages/core/config';
import {
    createMockRuntime,
    GeminiDomHistoryProvider,
    GeminiHistoryConfigLoader
} from '@packages/core/src';
import {
    DESKTOP_PROXY_REQUEST_CHANNEL,
    DESKTOP_PROXY_RESPONSE_CHANNEL,
    type ProxyRequest,
    type ProxyResponse
} from '../shared/proxyProtocol';
import { createAuthWindowManager } from './authWindow';
import { registerProviderLoginIpc } from './authIpc';
import { createControlledPageManager } from './controlledPageManager';
import { registerContextIpc } from './contextIpc';
import { GeminiHistoryPageBridge } from './GeminiHistoryPageBridge';
import { createDesktopHostRuntime, createProviderHost } from './providerHost';
import { getProviderSession } from './sessionManager';

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
const useMockRuntime = process.env.VITE_E2E === '1';
let disposeProviderLoginIpc: (() => void) | null = null;
let disposeContextIpc: (() => void) | null = null;
let geminiHistoryProvider: GeminiDomHistoryProvider | null = null;

class MemoryConfigStorage {
    private readonly data = new Map<string, string>();

    async get(key: string): Promise<string | null> {
        return this.data.get(key) ?? null;
    }

    async set(key: string, value: string): Promise<void> {
        this.data.set(key, value);
    }
}

const geminiHistoryConfigStorage = new MemoryConfigStorage();
const geminiHistoryConfigLoader = new GeminiHistoryConfigLoader({
    storage: geminiHistoryConfigStorage,
    env: process.env
});
const geminiHistoryBridge = new GeminiHistoryPageBridge({
    controlledPageManager,
    preloadPath: geminiHistoryPreloadPath,
    pageUrl: DEFAULT_GEMINI_HISTORY_PAGE_URL
});
const authWindowManager = createAuthWindowManager({
    async probeGeminiHistoryReady() {
        try {
            const { config } = await geminiHistoryConfigLoader.load();
            return await geminiHistoryBridge.probeHistoryListReady(config);
        } catch (error) {
            console.warn('Failed to probe Gemini history readiness from auth window.', error);
            return false;
        }
    }
});

function createMockDesktopRuntime() {
    return createMockRuntime({
        runtimeMode: 'desktop',
        defaultCharDelayMs: 2,
        slowCharDelayMs: 2,
        providerAuthOverrides: process.env.CHATPRISM_DESKTOP_E2E_CHATGPT_AUTH === '0'
            ? { 'chatgpt-web': false }
            : undefined
    });
}

function createChatGPTHostOptions() {
    const providerSession = getProviderSession('chatgpt-web');

    return {
        requestClient: {
            fetch(input: string, init?: RequestInit) {
                return providerSession.fetch(input, init);
            }
        },
        cookieStore: {
            async get(options: { url: string; name: string }) {
                const cookies = await providerSession.cookies.get({ url: options.url, name: options.name });
                const matched = cookies[0];
                return matched ? { value: matched.value } : null;
            }
        },
        userAgent: 'ChatPrism Desktop Host'
    };
}

const runtime = useMockRuntime
    ? undefined
    : createDesktopHostRuntime({
        geminiApiKey: process.env.CHATPRISM_LLM_API_KEY || process.env.VITE_LLM_API_KEY,
        resolveChatGPTProviderOptions: createChatGPTHostOptions
    });

const providerHost = createProviderHost({
    runtime,
    createRuntime() {
        if (useMockRuntime) {
            return createMockDesktopRuntime();
        }

        return createDesktopHostRuntime({
            geminiApiKey: process.env.CHATPRISM_LLM_API_KEY || process.env.VITE_LLM_API_KEY,
            resolveChatGPTProviderOptions: createChatGPTHostOptions
        });
    },
    async resolveHistoryProvider(providerId) {
        if (providerId === 'gemini-web') {
            if (!geminiHistoryProvider) {
                geminiHistoryProvider = new GeminiDomHistoryProvider({
                    configLoader: geminiHistoryConfigLoader,
                    tabBridge: geminiHistoryBridge
                });
            }

            return geminiHistoryProvider;
        }

        return undefined;
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
    ipcMain.on(DESKTOP_PROXY_REQUEST_CHANNEL, (event, message: ProxyRequest) => {
        void providerHost.handleRequest(message, (response: ProxyResponse) => {
            if (!event.sender.isDestroyed()) {
                event.sender.send(DESKTOP_PROXY_RESPONSE_CHANNEL, response);
            }
        });
    });
    disposeProviderLoginIpc = registerProviderLoginIpc({
        authWindowManager
    });
    disposeContextIpc = registerContextIpc({
        workspaceRoot: process.env.CHATPRISM_KNOWLEDGE_ROOT,
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
    disposeProviderLoginIpc?.();
    disposeProviderLoginIpc = null;
    authWindowManager.dispose();
});
