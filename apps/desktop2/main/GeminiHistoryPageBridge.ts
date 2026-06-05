import { DEFAULT_GEMINI_HISTORY_PAGE_URL, type GeminiHistoryRuntimeConfig } from '@packages/core/config';
import type { WebContents } from 'electron';
import type { ControlledPageManager } from './controlledPageManager';

const GEMINI_BRIDGE_GLOBAL = 'chatprismGeminiHistory';

export class GeminiHistoryPageBridge {
    private readonly pageUrl: string;
    private readonly consoleForwardedPages = new WeakSet<WebContents>();

    constructor(private readonly options: {
        controlledPageManager: ControlledPageManager;
        preloadPath: string;
        pageUrl?: string;
    }) {
        this.pageUrl = options.pageUrl ?? DEFAULT_GEMINI_HISTORY_PAGE_URL;
    }

    /**
     * Probes whether the user is authenticated to Gemini history by loading the page
     * and checking if the history list request succeeds without a login redirect.
     * Used by the auth window manager to determine when to show a login prompt.
     */
    async probeHistoryListReady(
        config: Record<string, unknown>,
        options: { forceReload?: boolean } = {}
    ): Promise<boolean> {
        const request = JSON.stringify({
            action: 'GET_HISTORY_LIST',
            config
        });

        const page = await this.options.controlledPageManager.ensurePage('gemini-web', {
            targetUrl: this.pageUrl,
            visible: false,
            preloadPath: this.options.preloadPath,
            forceReload: options.forceReload === true
        });

        this.forwardPageConsole(page);

        const response = await page.executeJavaScript(`
            (() => {
                const bridge = window.${GEMINI_BRIDGE_GLOBAL};
                if (!bridge || typeof bridge.request !== 'function') {
                    throw new Error('Gemini history preload bridge is unavailable');
                }
                return bridge.request(${request});
            })()
        `, true);

        return typeof response === 'object'
            && response !== null
            && 'ok' in response
            && (response as { ok?: unknown }).ok === true;
    }

    private forwardPageConsole(page: WebContents) {
        if (typeof page.on !== 'function' || this.consoleForwardedPages.has(page)) {
            return;
        }

        this.consoleForwardedPages.add(page);
        page.on('console-message', (_event, level, message, line, sourceId) => {
            if (!message.includes('[ChatPrism][GeminiHistory]')) {
                return;
            }

            console.log('[GeminiHistoryWindow]', message, JSON.stringify({
                level,
                line,
                sourceId,
                url: page.getURL()
            }));
        });
    }
}
