import { DEFAULT_GEMINI_HISTORY_PAGE_URL } from '@packages/core/config';
import type { WebContents } from 'electron';
import {
    assertGeminiContentResponse,
    type HistoryListQueryOptions,
    type GeminiContentConversationDetail,
    type GeminiContentHistorySummary,
    type GeminiContentRequest,
    type GeminiHistoryBridge,
    type GeminiHistoryRemoteConfig
} from '@packages/core/src';
import type { ControlledPageManager } from './controlledPageManager';

const GEMINI_BRIDGE_GLOBAL = 'chatprismGeminiHistory';
const GEMINI_TEMP_SEARCH_RESULT_PREFIX = 'gemini-search-result:';
const GEMINI_HISTORY_DETAIL_PAGE_SETTLE_MS = 800;
let geminiHistoryTraceCounter = 0;

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTargetUrl(pageUrl: string, externalId?: string): string {
    if (externalId?.startsWith(GEMINI_TEMP_SEARCH_RESULT_PREFIX)) {
        return pageUrl;
    }

    return externalId ? `${pageUrl.replace(/\/$/, '')}/${externalId}` : pageUrl;
}

export class GeminiHistoryPageBridge implements GeminiHistoryBridge {
    private readonly pageUrl: string;
    private readonly consoleForwardedPages = new WeakSet<WebContents>();

    constructor(private readonly options: {
        controlledPageManager: ControlledPageManager;
        preloadPath: string;
        pageUrl?: string;
    }) {
        this.pageUrl = options.pageUrl ?? DEFAULT_GEMINI_HISTORY_PAGE_URL;
    }

    async getHistoryList(
        config: GeminiHistoryRemoteConfig,
        options: HistoryListQueryOptions = {}
    ): Promise<GeminiContentHistorySummary[]> {
        const response = await this.sendRequest({
            action: 'GET_HISTORY_LIST',
            config,
            query: options.query
        }, undefined, 'history_load');
        return assertGeminiContentResponse<GeminiContentHistorySummary[]>(response);
    }

    async probeHistoryListReady(
        config: GeminiHistoryRemoteConfig,
        options: { forceReload?: boolean } = {}
    ): Promise<boolean> {
        const response = await this.sendRequest({
            action: 'GET_HISTORY_LIST',
            config
        }, undefined, 'auth_probe', {
            forceReload: options.forceReload === true
        });

        return typeof response === 'object'
            && response !== null
            && 'ok' in response
            && (response as { ok?: unknown }).ok === true;
    }

    async getHistoryDetail(
        config: GeminiHistoryRemoteConfig,
        externalId: string
    ): Promise<GeminiContentConversationDetail> {
        const response = await this.sendRequest({
            action: 'GET_HISTORY_DETAIL',
            config,
            externalId
        }, externalId, 'detail_load');
        return assertGeminiContentResponse<GeminiContentConversationDetail>(response);
    }

    private async sendRequest(
        request: GeminiContentRequest,
        externalId?: string,
        source: 'history_load' | 'auth_probe' | 'detail_load' = request.action === 'GET_HISTORY_DETAIL' ? 'detail_load' : 'history_load',
        options: { forceReload?: boolean } = {}
    ) {
        const traceId = `gemini-${source}-${Date.now()}-${++geminiHistoryTraceCounter}`;
        const targetUrl = getTargetUrl(this.pageUrl, externalId);
        const forceReload = options.forceReload === true || source === 'history_load';
        const requestWithTrace = {
            ...request,
            debugTraceId: traceId
        } satisfies GeminiContentRequest;
        if (request.action === 'GET_HISTORY_LIST') {
            console.log('[GeminiHistoryBridge]', JSON.stringify({
                stage: 'history-request-dispatch',
                traceId,
                source,
                query: request.query ?? '',
                targetUrl,
                forceReload
            }));
        }
        if (request.action === 'GET_HISTORY_DETAIL') {
            console.log('[GeminiHistoryBridge]', JSON.stringify({
                stage: 'detail-request-dispatch',
                traceId,
                source,
                externalId,
                targetUrl,
                forceReload
            }));
        }
        const page = await this.options.controlledPageManager.ensurePage('gemini-web', {
            targetUrl,
            visible: false,
            preloadPath: this.options.preloadPath,
            forceReload
        });
        this.forwardPageConsole(page);
        if (request.action === 'GET_HISTORY_LIST') {
            console.log('[GeminiHistoryBridge]', JSON.stringify({
                stage: 'history-request-page-ready',
                traceId,
                source,
                query: request.query ?? '',
                targetUrl,
                pageUrl: page.getURL()
            }));
        }
        if (request.action === 'GET_HISTORY_DETAIL') {
            console.log('[GeminiHistoryBridge]', JSON.stringify({
                stage: 'detail-request-page-ready',
                traceId,
                source,
                externalId,
                targetUrl,
                pageUrl: page.getURL()
            }));
            await sleep(GEMINI_HISTORY_DETAIL_PAGE_SETTLE_MS);
            console.log('[GeminiHistoryBridge]', JSON.stringify({
                stage: 'detail-request-page-settled',
                traceId,
                source,
                externalId,
                targetUrl,
                pageUrl: page.getURL(),
                settleDelayMs: GEMINI_HISTORY_DETAIL_PAGE_SETTLE_MS
            }));
        }
        const requestJson = JSON.stringify(requestWithTrace);

        const response = await page.executeJavaScript(`
            (() => {
                const bridge = window.${GEMINI_BRIDGE_GLOBAL};
                if (!bridge || typeof bridge.request !== 'function') {
                    throw new Error('Gemini history preload bridge is unavailable');
                }

                return bridge.request(${requestJson});
            })()
        `, true);
        if (request.action === 'GET_HISTORY_LIST') {
            console.log('[GeminiHistoryBridge]', JSON.stringify({
                stage: 'history-request-response',
                traceId,
                source,
                query: request.query ?? '',
                targetUrl,
                pageUrl: page.getURL(),
                ok: typeof response === 'object' && response !== null && 'ok' in response ? (response as { ok?: unknown }).ok === true : null
            }));
        }
        if (request.action === 'GET_HISTORY_DETAIL') {
            console.log('[GeminiHistoryBridge]', JSON.stringify({
                stage: 'detail-request-response',
                traceId,
                source,
                externalId,
                targetUrl,
                pageUrl: page.getURL(),
                ok: typeof response === 'object' && response !== null && 'ok' in response ? (response as { ok?: unknown }).ok === true : null
            }));
        }
        return response;
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
